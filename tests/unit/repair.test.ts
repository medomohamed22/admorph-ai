import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { describe, it, expect, vi,beforeEach } from 'vitest';
import { compose } from '../../src/lib/editor/composition';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { applyActions, proposeLocal, verifyRepair, validateReceipt } from '../../src/lib/repair/engine';
import { repairResponseSchema, type RepairReceipt } from '../../src/lib/repair/schema';
import { fingerprint } from '../../src/lib/critic/rules';
import { normalizeFingerprint } from '../../src/lib/critic/rules';
import type { EditableLayer } from '../../src/lib/editor/schema';
import { persistRepair, loadLatestRepair } from '../../src/lib/repair/repository';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { saveCreative } from '../../src/lib/editor/repository';
import { handleRepairRequest } from '../../src/lib/ai/repair-server';
import { handleMetaSmoke } from '../../src/lib/ai/meta-smoke-server';
const measure = (layers: EditableLayer[]) => Object.fromEntries(layers.filter(layer => layer.visible && ['headline','brand','cta'].includes(layer.kind)).map(layer => [layer.id, { neededHeight: 16 + Math.ceil(layer.text.length * layer.fontSize * .7 / Math.max(1, layer.width - 16)) * layer.fontSize * 1.2, unrenderable: layer.width - 16 < layer.fontSize * .6 }]));
function fixture() { const campaign = newCampaign(), concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true }; return compose(campaign, concept, crypto.randomUUID(), null); }
function receipt() { const before = fixture(), headline = before.layers.find(layer => layer.kind === 'headline')!; const actions = [{ type: 'set_color' as const, layerId: headline.id, color: '#000000' }];
  return { id: crypto.randomUUID(), creativeId: before.id, appliedAt: new Date().toISOString(), source: 'local' as const, model: null, language: 'en' as const, rationale: 'Improve measured contrast.', actions, before, after: applyActions(before, actions), iteration: 1 as const, rootFingerprint: fingerprint(before) }; }
function request(body: unknown, path: string, origin = 'https://app.test') { return new Request('https://app.test' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
describe('repair safety', () => {
  it('rejects executable, image-replacement and unknown-layer actions', () => {
    const creative = fixture(); expect(repairResponseSchema.safeParse({ rationale: 'bad', actions: [{ type: 'execute_js', code: 'alert(1)' }] }).success).toBe(false);
    expect(repairResponseSchema.safeParse({ rationale: 'bad', actions: [{ type: 'set_image', layerId: creative.layers[0].id, url: 'http://localhost' }] }).success).toBe(false);
    expect(() => applyActions(creative, [{ type: 'set_text', layerId: crypto.randomUUID(), text: 'changed' }])).toThrow('repair_invalid');
    expect(() => applyActions(creative, [{ type: 'set_text', layerId: creative.layers.find(layer => layer.kind === 'product')!.id, text: 'changed' }])).toThrow('repair_invalid');
  });
  it('clamps numeric commands, preserves image identity and leaves the input untouched', () => {
    const creative = fixture(), original = structuredClone(creative), headline = creative.layers.find(layer => layer.kind === 'headline')!;
    const after = applyActions(creative, [{ type: 'resize_layer', layerId: headline.id, width: 10000, height: -10 }, { type: 'move_layer', layerId: headline.id, x: -100, y: 10000 }, { type: 'set_font_size', layerId: headline.id, fontSize: 999 }]);
    const layer = after.layers.find(item => item.id === headline.id)!; expect(layer.x).toBe(0); expect(layer.width).toBe(1080); expect(layer.height).toBe(24); expect(layer.y).toBe(1326); expect(layer.fontSize).toBe(160);
    expect(creative).toEqual(original); expect(after.layers.map(item => item.assetId)).toEqual(creative.layers.map(item => item.assetId));
  });
  it('proposes verified clipping/contrast improvements without truncating original Arabic copy', () => {
    const creative = fixture(), headline = creative.layers.find(layer => layer.kind === 'headline')!;
    Object.assign(headline, { text: 'عنوان عربي يحتاج إلى مساحة مناسبة ليظهر دون قص واضح للمستخدم', width: 120, height: 24, fontSize: 160, color: '#ffffff' });
    const assets = new Set(creative.layers.flatMap(layer => layer.assetId ? [layer.assetId] : [])), actions = proposeLocal(creative, measure, assets), after = applyActions(creative, actions), result = verifyRepair(creative, after, measure, assets);
    expect(result.before.issues.some(issue => issue.code === 'text_clipped')).toBe(true); expect(result.after.issues.some(issue => issue.code === 'text_clipped' || issue.code === 'contrast')).toBe(false); expect(result.regression).toBe(false); expect(after.layers.find(layer => layer.id === headline.id)?.text).toBe(headline.text);
  });
  it('blocks regressions and does not invent missing copy or image assets', () => {
    const creative = fixture(), headline = creative.layers.find(layer => layer.kind === 'headline')!, assets = new Set(creative.layers.flatMap(layer => layer.assetId ? [layer.assetId] : []));
    const after = applyActions(creative, [{ type: 'set_text', layerId: headline.id, text: '' }]); expect(verifyRepair(creative, after, measure, assets).regression).toBe(true);
    headline.text = ''; expect(proposeLocal(creative, measure, new Set()).every(action => action.type !== 'set_text')).toBe(true);
    expect(repairResponseSchema.safeParse({ rationale: 'too many', actions: Array.from({ length: 17 }, () => ({ type: 'show_layer', layerId: headline.id })) }).success).toBe(false);
  });
  it('validates receipt snapshots by replaying actions and limits cycles to two', () => {
    const record = receipt(); expect(validateReceipt(record)).toEqual(record);
    expect(() => validateReceipt({ ...record, after: { ...record.after, caption: 'unapproved change' } })).toThrow('repair_invalid');
    expect(() => validateReceipt({ ...record, iteration: 3 } as unknown as RepairReceipt)).toThrow();
  });
  it('recognizes unchanged layouts regardless of property order and retains legacy review fingerprints', () => {
    const creative = fixture(), reordered = { ...creative, layers: creative.layers.map(layer => Object.fromEntries(Object.entries(layer).reverse())) } as typeof creative;
    expect(fingerprint(reordered)).toBe(fingerprint(creative));
    const legacy = JSON.stringify({ id:creative.id, layers:creative.layers, caption:creative.caption, inputRevision:creative.inputRevision });
    expect(normalizeFingerprint(legacy)).toBe(fingerprint(creative));
    expect(normalizeFingerprint('unparseable-old-record')).toBe('unparseable-old-record');
  });
});
describe('repair persistence', () => {
  it('saves snapshots and repaired metadata atomically and keeps an original for restoration', async () => {
    const db = new AdMorphDB(`repair-${crypto.randomUUID()}`), record = receipt(), asset = { id: record.before.layers.find(layer => layer.kind === 'product')!.assetId!, kind: 'product' as const, blob: new Blob(['photo']), createdAt: record.appliedAt };
    try { await saveCreative(record.before, [asset], db); await persistRepair(record, [asset], db); expect(await loadLatestRepair(record.creativeId, db)).toEqual(record); expect(fingerprint((await db.creatives.get(record.creativeId))!)).toBe(fingerprint(record.after));
      await saveCreative(record.before, [asset], db); expect(fingerprint((await db.creatives.get(record.creativeId))!)).toBe(fingerprint(record.before)); expect(await db.repairHistory.count()).toBe(1);
      expect(JSON.stringify(await db.repairHistory.toArray())).not.toMatch(/data:image|apiKey|b64_json/);
    } finally { await db.delete(); }
  });
  it('rolls back a receipt when an image reference is missing and upgrades version four without clearing data', async () => {
    const name = `repair-upgrade-${crypto.randomUUID()}`, old = new Dexie(name), record = receipt();
    old.version(4).stores({ settings:'key', brands:'id, updatedAt', assets:'id, kind, createdAt', modelCatalogCache:'providerId, fetchedAt', encryptedCredentials:'providerId', campaigns:'id, brandId, updatedAt', creatives:'id, campaignId, conceptId, updatedAt', creativeReviews:'id, creativeId, reviewedAt' });
    await old.table('creatives').put(record.before); await old.table('settings').put({ key:'locale', value:'ar' }); old.close();
    const db = new AdMorphDB(name); try { await db.open(); expect(db.verno).toBe(6); expect((await db.settings.get('locale'))?.value).toBe('ar'); await expect(persistRepair(record, [], db)).rejects.toThrow('missing_asset'); expect(await db.repairHistory.count()).toBe(0); expect(await db.creatives.get(record.creativeId)).toEqual(record.before); } finally { await db.delete(); }
  });
});
let testKey='';beforeEach(()=>{testKey=crypto.randomUUID();});
describe('paid adapters', () => {
  it('validates a selected-model Meta repair proposal and rejects unsafe commands before returning it', async () => {
    const creative = fixture(), preview = await sharp({ create: { width:540, height:675, channels:3, background:'#eeeecc' } }).jpeg().toBuffer();
    const body = { providerId: 'meta', apiKey:testKey, modelId:'chosen-edit-model', consent:true, imageConsent:true, language:'en', creativeLanguage:'en', creative, preview:{ mimeType:'image/jpeg', data:preview.toString('base64') } };
    const actions = [{ type:'set_font_size', layerId:creative.layers.find(layer => layer.kind === 'headline')!.id, fontSize:48 }];
    const fetcher = vi.fn(async () => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({rationale:'Conservative font adjustment.',actions})}}]}));
    const response = await handleRepairRequest(request(body, '/api/ai/repairs'), { fetcher }); expect(response.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(1); const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toBe('https://api.meta.ai/v1/chat/completions'); expect(init.headers).toMatchObject({ Authorization:`Bearer ${body.apiKey}` }); expect(init.body).not.toContain(body.apiKey);
    const bad = await handleRepairRequest(request(body, '/api/ai/repairs'), { fetcher:async () => Response.json({ candidates:[{ finishReason:'STOP', content:{ parts:[{ text:JSON.stringify({ rationale:'bad', actions:[{ type:'execute_js', code:'run()' }] }) }] } }] }) }); expect(bad.status).toBeGreaterThanOrEqual(400);
    const unused = vi.fn(); expect((await handleRepairRequest(request({ ...body, imageConsent:false }, '/api/ai/repairs'), { fetcher:unused })).status).toBe(400); expect(unused).not.toHaveBeenCalled();
  });
  it('does not retry Meta repair failures or accept a truncated repair plan', async () => {
    const creative = fixture(), preview = await sharp({ create:{ width:540, height:675, channels:3, background:'#ffffff' } }).jpeg().toBuffer();
    const body = { providerId: 'meta', apiKey:'fixture-repair-key', modelId:'chosen-edit-model', consent:true, imageConsent:true, language:'en', creativeLanguage:'en', creative, preview:{ mimeType:'image/jpeg', data:preview.toString('base64') } };
    for (const reply of [Response.json({ error:body.apiKey }, { status:429 }), Response.json({ candidates:[{ finishReason:'MAX_TOKENS' }] })]) { const fetcher=vi.fn(async()=>reply), response=await handleRepairRequest(request(body,'/api/ai/repairs'),{fetcher}); expect(response.status).toBeGreaterThanOrEqual(400); expect(await response.text()).not.toContain(body.apiKey); expect(fetcher).toHaveBeenCalledTimes(1); }
    const fetcher=vi.fn((_url:unknown, init?:RequestInit)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('timeout')))));
    expect((await handleRepairRequest(request(body,'/api/ai/repairs'),{fetcher,timeoutMs:100})).status).toBe(504); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses Meta chat wire format with a fixed prompt and one paid attempt', async () => {
    const body = { providerId:'meta', apiKey:testKey, modelId:'selected-text', kind:'text', consent:true }, fetcher = vi.fn(async () => Response.json({ id:'meta-response', choices:[{ finish_reason:'stop', message:{ content:'ready' } }] }));
    const result = await handleMetaSmoke(request(body, '/api/providers/meta-smoke'), { fetcher }); expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ kind:'text', source:'live', reply:'ready', modelId:'selected-text' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toBe('https://api.meta.ai/v1/chat/completions'); expect(init.headers).toMatchObject({ Authorization:`Bearer ${body.apiKey}` }); const payload = JSON.parse(init.body as string); expect(payload.messages[0].content).toBe('Reply with the single word: ready'); expect(payload.max_completion_tokens).toBe(512); expect(init.body).not.toContain(body.apiKey);
  });
  it('keeps Meta image wire format separate and refuses remote image URLs', async () => {
    const body = { providerId:'meta', apiKey:'fixture-meta-key', modelId:'selected-image', kind:'image', consent:true }, png = await readFile('public/demo/sora-product.png');
    const fetcher = vi.fn(async () => Response.json({ data:[{ b64_json:png.toString('base64') }], output_format:'png' }));
    const result = await handleMetaSmoke(request(body, '/api/providers/meta-smoke'), { fetcher }); expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe('image/png'); expect(Buffer.from(await result.arrayBuffer())).toEqual(png);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toBe('https://api.meta.ai/v1/images/generations'); expect(JSON.parse(init.body as string)).toMatchObject({ n:1, response_format:'b64_json', output_format:'png' });
    const invalid = await handleMetaSmoke(request(body, '/api/providers/meta-smoke'), { fetcher:async () => Response.json({ data:[{ url:'http://localhost/private' }] }) }); expect(invalid.status).toBe(502);
  });
  it('rejects missing consent/origin/URL injection and never retries failures or timeouts', async () => {
    const body = { providerId:'meta', apiKey:'fixture-meta-key', modelId:'selected-text', kind:'text', consent:true }, unused = vi.fn();
    for (const req of [request(body, '/api/providers/meta-smoke', 'https://evil.test'), request({ ...body, consent:false }, '/api/providers/meta-smoke'), request({ ...body, baseUrl:'http://localhost' }, '/api/providers/meta-smoke')]) expect((await handleMetaSmoke(req, { fetcher:unused })).status).toBeGreaterThanOrEqual(400); expect(unused).not.toHaveBeenCalled();
    for (const status of [401,429,503]) { const fetcher = vi.fn(async () => Response.json({ error:body.apiKey }, { status })); const response = await handleMetaSmoke(request(body, '/api/providers/meta-smoke'), { fetcher }); expect(await response.text()).not.toContain(body.apiKey); expect(fetcher).toHaveBeenCalledTimes(1); }
    const fetcher = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('abort'))))); expect((await handleMetaSmoke(request(body, '/api/providers/meta-smoke'), { fetcher, timeoutMs:100 })).status).toBe(504); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
