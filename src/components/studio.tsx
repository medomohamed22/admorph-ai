'use client';
import {metaFetch} from '@/lib/ai/meta-fetch';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import { useCampaign } from './campaign-session';
import { useStudio } from './studio-session';
import { useWorkspace, useMessages } from './workspace';
import { cutoutImage } from '@/lib/cutout/provider';
import { findCutoutAsset } from '@/lib/cutout/provenance';
import { blobToBase64 } from '@/lib/cutout/raster';
import { buildVisionBrief, withStrictNegatives, visionBackgroundAnalysisSchema, checkBackgroundSchema, type VisionBackgroundAnalysis, type CheckBackgroundResult } from '@/lib/background/brief';
import { useObjectUrl } from './logo';
import { resolveLayerDirection } from '@/lib/editor/direction';
import { dimensionsFor } from '@/lib/editor/sizes';
import { applyTemplate, TEMPLATE_IDS, type TemplateId } from '@/lib/editor/templates';
import { referenceLayoutSchema, type ReferenceLayout } from '@/lib/ai/reference';
import { getDatabase } from '@/lib/db/dexie';
import type { Asset } from '@/lib/db/schema';
import { useProviderSession } from './provider-session';
import { errorCode, ProviderError, type ErrorCode } from '@/lib/ai/errors';
import { conceptFieldsSchema } from '@/lib/campaign/schema';
import type { EditableLayer } from '@/lib/editor/schema';
import { readJsonLimited } from '@/lib/ai/transport';
import {StudioTools} from './studio-tools';
import {IssueFix} from './issue-fix';
import {ProductMakeover} from './product-makeover';
import {checkCreative,fingerprint} from '@/lib/critic/rules';
import { paintLocalBackground } from '@/lib/background/local';
import type {Finding} from '@/lib/critic/schema';
import { CriticPanel } from './critic-panel';

export default function Studio({ campaignId }: { campaignId: string }) {
  const session = useCampaign(), studio = useStudio(), workspace = useWorkspace(), provider = useProviderSession();
  const m = useMessages(), s = m.studio;
  const conceptId = useSearchParams().get('concept');
  const campaign = session.draft?.id === campaignId ? session.draft : session.campaigns.find(item => item.id === campaignId);
  const concept = conceptId ? campaign?.concepts.find(item => item.id === conceptId) : campaign?.concepts[0];
  const product = session.assets.find(item => item.id === campaign?.productAssetId);
  const brand = workspace.brands.find(item => item.id === campaign?.brandId);
  const logo = workspace.assets.find(item => item.id === brand?.logoAssetId) ?? null;
  const approved = !!concept?.approved && campaign?.planRevision === campaign?.inputRevision;
  const { open } = studio;
  useEffect(() => { if (workspace.phase !== 'loading' && campaign && concept && product) void open(campaign, concept, product, logo, approved); }, [workspace.phase, campaign, concept, product, logo, approved, open]);

  const creative = studio.creative?.campaignId === campaignId && studio.creative.conceptId === concept?.id ? studio.creative : null;
  const samKey = provider.configs.meta.apiKey.trim();
  const segmentModel = provider.taskModel('segment')?.modelId ?? '';
  const samReady = !!samKey && !!segmentModel;
  const [cutoutState, setCutoutState] = useState<'idle' | 'cutting' | 'done' | 'sam-fallback' | 'error'>('idle');
  const [cutoutNote, setCutoutNote] = useState('');
  // Which method produced the applied cutout, so a successful cut is no
  // longer silent about it (previously only failures showed a note).
  const [cutoutMethod, setCutoutMethod] = useState<'meta-sam' | 'local' | null>(null);
  const cutoutAttempted = useRef<string | null>(null);
  const visionModel = provider.taskModel('vision');
  const visionKey = visionModel ? provider.configs[visionModel.provider].apiKey.trim() : '';
  const [visionAnalysis, setVisionAnalysis] = useState<VisionBackgroundAnalysis | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionNote, setVisionNote] = useState('');
  async function runCutout(mode: 'sam' | 'local') {
    if (!creative || !product || cutoutState === 'cutting') return;
    setCutoutState('cutting');
    setCutoutNote('');
    setCutoutMethod(null);
    try {
      let result;
      if (mode === 'sam' && samReady) {
        try {
          result = await cutoutImage(product.blob, 'meta-sam', { apiKey: samKey, modelId: segmentModel, prompt: 'product' });
        } catch {
          result = await cutoutImage(product.blob, 'local');
          setCutoutState('sam-fallback');
          setCutoutNote(m.cutout.samFallbackNote);
        }
      } else {
        if (mode === 'sam') {
          setCutoutState('sam-fallback');
          setCutoutNote(m.cutout.samFallbackNote);
        }
        result = await cutoutImage(product.blob, 'local');
      }
      const asset: Asset = { id: crypto.randomUUID(), kind: 'cutout', blob: result.cutoutBlob, createdAt: new Date().toISOString(), meta: { derivedFrom: product.id, provider: result.provider, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight, reliable: result.reliable } };
      try { await getDatabase().assets.put(asset); } catch { /* library save is best-effort; the creative still holds it */ }
      if (studio.replaceProductLayer(asset)) { setCutoutState((previous) => previous === 'sam-fallback' ? previous : 'done'); setCutoutMethod(result.provider); }
    } catch {
      setCutoutState('error');
      setCutoutNote(m.cutout.cutoutFailed);
    }
  }
  // Auto-cutout: when the campaign asks for it, a fresh creative uses the
  // library cutout for this product if one exists, otherwise segments once.
  // SAM failure is never silent: it falls back to local with a visible note.
  useEffect(() => {
    if (!creative || !campaign || !product) return;
    const mode = campaign.autoCutout ?? 'off';
    if (mode === 'off' || cutoutState === 'cutting') return;
    const attemptKey = `${campaign.id}:${product.id}:${creative.id}`;
    if (cutoutAttempted.current === attemptKey) return;
    const layer = creative.layers.find((item) => item.kind === 'product');
    const layerAsset = studio.assets.find((item) => item.id === layer?.assetId);
    if (!layer || layerAsset?.kind === 'cutout') return;
    cutoutAttempted.current = attemptKey;
    void (async () => {
      const library = await getDatabase().assets.where('kind').equals('cutout').toArray().catch(() => [] as Asset[]);
      const existing = findCutoutAsset(library, product.id);
      if (existing) {
        studio.replaceProductLayer(existing);
        return;
      }
      await runCutout(mode);
    })();
    // Only the creative identity gates this; runCutout is stable by closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creative, campaign, product]);
  const [selected, setSelected] = useState<string | null>(null), [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<'layers' | 'edit' | 'generate' | 'review' | 'export'>('edit');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [fontsReady, setFontsReady] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState(false), [layoutBusy, setLayoutBusy] = useState(false), [referenceLayout, setReferenceLayout] = useState<ReferenceLayout | null>(null);
  const canvasScope = useMemo(() => ({ creativeId: creative?.id }), [creative?.id]);
  const [loaded, setLoaded] = useState<{ scope: object | null; ids: Set<string> }>({ scope: null, ids: new Set() }), [error, setError] = useState<ErrorCode | null>(null);
  const handle = useRef<CanvasHandle | null>(null), abort = useRef<AbortController | null>(null), requestId = useRef(0);
  const visionWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null), visionRunId = useRef(0);
  const [wide,setWide]=useState(false),[exportNotice,setExportNotice]=useState<{signature:string;text:string}|null>(null);
  useEffect(()=>{const media=window.matchMedia('(min-width:751px)'),update=()=>setWide(media.matches);Promise.resolve().then(update);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const [markers,setMarkers]=useState(true),[issues,setIssues]=useState<Finding[]>([]),[activeIssue,setActiveIssue]=useState<Finding|null>(null);
  const onReady = useCallback((id: string) => setLoaded(previous => previous.scope === canvasScope ? previous.ids.has(id) ? previous : { scope: canvasScope, ids: new Set([...previous.ids, id]) } : { scope: canvasScope, ids: new Set([id]) }), [canvasScope]);
  useEffect(() => { let alive = true; Promise.all([document.fonts.load('48px Inter'), document.fonts.load('48px Cairo')]).then(() => { if (alive) setFontsReady(true); }); return () => { alive = false; }; }, []);
  useEffect(() => () => { requestId.current++; abort.current?.abort(); }, []);
  useEffect(() => () => { if (visionWatchdog.current) clearTimeout(visionWatchdog.current); }, []);
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) { setBusy(false); setConsent(false); setSelected(null); setError(null); setCutoutMethod(null); } }); return () => { alive = false; }; }, [campaignId, concept?.id, provider.keyEpoch]);
  useEffect(() => () => { requestId.current++; abort.current?.abort(); }, [campaignId, concept?.id, provider.keyEpoch]);
  const imageModel = provider.taskModel('image');
  const imageReady = imageModel?.provider === 'meta' ;
  const key = imageModel ? provider.configs[imageModel.provider].apiKey.trim() : '';
  const layer = creative?.layers.find(item => item.id === selected) ?? creative?.layers.find(item => item.kind === 'headline');
  const referenceAsset = creative?.referenceAssetId ? studio.assets.find(item => item.id === creative.referenceAssetId) : undefined;
  const referenceUrl = useObjectUrl(referenceAsset?.blob ?? null);
  const ready = fontsReady && !!creative && creative.layers.filter(item => item.visible && item.assetId).every(item => loaded.scope === canvasScope && loaded.ids.has(item.assetId!));
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{if(alive&&ready&&creative&&handle.current)setIssues(checkCreative(creative,handle.current.measureText(),new Set(studio.assets.map(asset=>asset.id)),dimensionsFor(creative.format)).issues);});return()=>{alive=false;};},[creative,ready,studio.assets]);
  /** Vision-first step: analyze the product photo into scene ideas. */
  async function analyzeProduct() {
    if (!product || !visionModel || !visionKey || !consent || visionBusy) return;
    setVisionBusy(true); setVisionNote(''); setError(null);
    // The fetch below already aborts at 55s, but a promise that never
    // settles (or post-fetch work that hangs) would still leave the button
    // stuck on "Analyzing…". This watchdog guarantees recovery with a clear
    // timeout message even then; the run id keeps a stale timer from
    // cancelling a newer analysis.
    const runId = ++visionRunId.current;
    if (visionWatchdog.current) clearTimeout(visionWatchdog.current);
    visionWatchdog.current = setTimeout(() => {
      if (visionRunId.current === runId) { setVisionBusy(false); setError('timeout'); }
    }, 65000);
    try {
      const data = await blobToBase64(product.blob);
      const response = await metaFetch('vision', '/api/ai/vision-background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: visionModel.modelId, apiKey: visionKey, consent: true, imageConsent: true, image: { mimeType: product.blob.type, data } }),
        signal: AbortSignal.timeout(55000), cache: 'no-store' });
      if (!response.ok) {
        const body = await readJsonLimited(response, 32768) as { error?: { code?: ErrorCode } };
        throw new ProviderError(body.error?.code && body.error.code in m.settings.errors ? body.error.code : 'image_response', response.status);
      }
      setVisionAnalysis(visionBackgroundAnalysisSchema.parse(await response.json()));
      setSelectedScene(0);
    } catch (cause) { setError(errorCode(cause)); }
    finally { if (visionWatchdog.current) { clearTimeout(visionWatchdog.current); visionWatchdog.current = null; } setVisionBusy(false); }
  }
  /**
   * Product-presence check on a generated background. A failed check (network
   * or upstream error) returns null and never blocks generation; a positive
   * check blocks the background and triggers one strict regeneration.
   */
  async function checkBackground(blob: Blob): Promise<CheckBackgroundResult | null> {
    if (!visionModel || !visionKey) return null;
    try {
      const data = await blobToBase64(blob);
      const response = await metaFetch('vision', '/api/ai/check-background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: visionModel.modelId, apiKey: visionKey, consent: true, imageConsent: true, image: { mimeType: blob.type, data } }),
        signal: AbortSignal.timeout(55000), cache: 'no-store' });
      if (!response.ok) return null;
      return checkBackgroundSchema.parse(await response.json());
    } catch { return null; }
  }
  async function generate() {
    if (!creative || !campaign || !concept || !approved || !imageReady || !imageModel || !key || !consent || busy) return;
    const id = ++requestId.current; const controller = new AbortController(); abort.current = controller; setBusy(true); setError(null); setVisionNote('');
    try {
      const brief = visionAnalysis ? buildVisionBrief(visionAnalysis, selectedScene, campaign.brandSnapshot.colors) : undefined;
      let blob: Blob | null = null;
      let blocked = false;
      for (let attempt = 0; attempt < 2 && !blob && !blocked; attempt++) {
        const attemptBrief = attempt === 0 ? brief : brief ? withStrictNegatives(brief) : undefined;
        const response = await metaFetch('image', '/api/ai/background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, approved: true,
            brand: campaign.brandSnapshot, concept: conceptFieldsSchema.parse({ angle: concept.angle, title: concept.title, audienceAngle: concept.audienceAngle, headline: concept.headline, caption: concept.caption, visualDirection: concept.visualDirection, spatialPreset: concept.spatialPreset, negativeSpaceInstruction: concept.negativeSpaceInstruction }),
            backgroundBrief: attemptBrief }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
        if (!response.ok) {
          const body = await readJsonLimited(response, 32768) as { error?: { code?: ErrorCode } };
          throw new ProviderError(body.error?.code && body.error.code in m.settings.errors ? body.error.code : 'image_response', response.status);
        }
        const candidate = await response.blob();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type) || candidate.size > 3 * 1024 * 1024) throw new ProviderError('image_response');
        const url = URL.createObjectURL(candidate);
        try { const image = new Image(); image.src = url; await image.decode(); if (image.width > 4096 || image.height > 4096) throw new ProviderError('image_response'); }
        finally { URL.revokeObjectURL(url); }
        const check = await checkBackground(candidate);
        if (check?.hasProduct) {
          // Vision path: one strict regeneration. Legacy path (no brief):
          // no stronger prompt exists, so block and let the user pick a scene.
          if (attempt === 0 && brief) continue;
          blocked = true;
        } else {
          blob = candidate;
        }
      }
      if (blocked) { setVisionNote(s.visionProductFound); return; }
      if (requestId.current === id && !controller.signal.aborted && blob) { studio.background(blob, 'meta', imageModel); setConsent(false); }
    } catch (cause) { if (requestId.current === id) setError(controller.signal.aborted ? 'cancelled' : errorCode(cause)); }
    finally { if (requestId.current === id) { setBusy(false); abort.current = null; } }
  }
  /** Reference image: a full AI render as a style target only — never a layer, never exported. */
  async function generateReference() {
    if (!creative || !campaign || !concept || !approved || !imageReady || !imageModel || !key || !consent || busy || referenceBusy || !product) return;
    setReferenceBusy(true); setError(null);
    try {
      const data = await blobToBase64(product.blob);
      const response = await metaFetch('image', '/api/ai/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true,
          image: { mimeType: product.blob.type, data }, brand: campaign.brandSnapshot, headline: concept.headline,
          visualDirection: concept.visualDirection, scene: visionAnalysis?.sceneIdeas[selectedScene]?.scene }),
        signal: AbortSignal.timeout(55000), cache: 'no-store' });
      if (!response.ok) {
        const body = await readJsonLimited(response, 32768) as { error?: { code?: ErrorCode } };
        throw new ProviderError(body.error?.code && body.error.code in m.settings.errors ? body.error.code : 'image_response', response.status);
      }
      const candidate = await response.blob();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type) || candidate.size > 3 * 1024 * 1024) throw new ProviderError('image_response');
      const url = URL.createObjectURL(candidate);
      try { const image = new Image(); image.src = url; await image.decode(); if (image.width > 4096 || image.height > 4096) throw new ProviderError('image_response'); }
      finally { URL.revokeObjectURL(url); }
      studio.setReference(candidate); setReferenceLayout(null); setConsent(false);
    } catch (cause) { setError(errorCode(cause)); }
    finally { setReferenceBusy(false); }
  }
  /** Layout hints: vision reads the reference zones and suggests the closest template; applying is the user's call. */
  async function analyzeReferenceLayout() {
    if (!creative || !referenceAsset || !visionModel || !visionKey || !consent || layoutBusy) return;
    setLayoutBusy(true); setError(null);
    try {
      const data = await blobToBase64(referenceAsset.blob);
      const response = await metaFetch('vision', '/api/ai/reference-layout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: visionModel.modelId, apiKey: visionKey, consent: true, imageConsent: true, image: { mimeType: referenceAsset.blob.type, data } }),
        signal: AbortSignal.timeout(55000), cache: 'no-store' });
      if (!response.ok) {
        const body = await readJsonLimited(response, 32768) as { error?: { code?: ErrorCode } };
        throw new ProviderError(body.error?.code && body.error.code in m.settings.errors ? body.error.code : 'image_response', response.status);
      }
      setReferenceLayout(referenceLayoutSchema.parse(await response.json()));
    } catch (cause) { setError(errorCode(cause)); }
    finally { setLayoutBusy(false); }
  }
  function localBackground() {
    if (!creative || !campaign || busy) return;
    setError(null); const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d')!;
    paintLocalBackground(ctx, campaign.brandSnapshot.colors);
    canvas.toBlob(blob => { if (blob) studio.background(blob, 'local', null); }, 'image/png');
  }
  async function download() {
    setError(null);
    try { if(!ready||!creative||!handle.current)throw new Error();await document.fonts.ready;const checked=checkCreative(creative,handle.current.measureText(),new Set(studio.assets.map(asset=>asset.id)),dimensionsFor(creative.format));setExportNotice({signature:fingerprint(creative),text:`${m.meta.preflight}: ${checked.issues.filter(issue=>issue.severity!=='info').length} · ${m.meta.preflightNote}`});const url = handle.current.exportPng(); const link = document.createElement('a'); link.href = url; link.download = `admorph-${creative?.id}.png`; link.click(); }
    catch { setError('export_error'); }
  }
  if (!session.ready) return <section className="studio-page"><p role="status">{s.loading}</p></section>;
  if (!campaign || !concept || !product) return <section className="studio-page"><h1>{s.missing}</h1><Link className="button primary" href="/campaigns/new">{s.back}</Link></section>;
  if (!creative && !approved) return <section className="studio-page"><h1>{s.approveFirst}</h1><Link className="button primary" href="/campaigns/new">{s.back}</Link></section>;
  if (!creative) return <section className="studio-page"><p role="status">{s.loading}</p></section>;
  const dimensions = dimensionsFor(creative.format);
  const patch = (values: Partial<EditableLayer>) => { if (layer) studio.patch(layer.id, values); };
  const productLayerAsset = creative.layers.find((item) => item.kind === 'product') ? studio.assets.find((item) => item.id === creative.layers.find((item) => item.kind === 'product')?.assetId) : undefined;
  const revertToOriginal = () => { const owned = studio.assets.find((item) => item.kind === 'product'); if (owned) studio.replaceProductLayer(owned); setCutoutMethod(null); };
  return <section className="studio-page">
    <div className="studio-heading"><div><Link href="/campaigns/new">← {s.back}</Link><span className="eyebrow">{s.eyebrow}</span><h1>{s.title}</h1><p>{concept.title} · <bdi>{dimensions.width} × {dimensions.height}</bdi></p></div><div className="studio-actions"><button onClick={studio.undo} disabled={!studio.canUndo || busy}>{s.undo}</button><button onClick={studio.redo} disabled={!studio.canRedo || busy}>{s.redo}</button>{productLayerAsset?.kind === 'cutout' ? <button className="button secondary" onClick={revertToOriginal}>{m.cutout.useOriginal}</button> : <button className="button secondary" disabled={cutoutState === 'cutting'} onClick={() => void runCutout(samReady ? 'sam' : 'local')}>{cutoutState === 'cutting' ? m.cutout.cutting : m.cutout.cut}</button>}<button className="button secondary" onClick={() => { setTab('review'); requestAnimationFrame(() => document.getElementById('creative-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{m.critic.open}</button><button className="button primary" onClick={download} disabled={!ready}>{s.download} ↗</button></div></div>
    <div className="studio-status"><span role="status" data-testid="studio-save">{m.campaign.save[studio.saveState]}</span><button className="text-button" onClick={() => void studio.flush()}>{m.campaign.saveNow}</button><span>{s.sources[creative.source]}</span>{cutoutState === 'cutting' && <span>{m.cutout.cutting}</span>}{cutoutMethod && <span>{cutoutMethod === 'meta-sam' ? m.cutout.providerSam : m.cutout.providerLocal}</span>}{cutoutNote && <span role="status">{cutoutNote}</span>}</div>
    <nav className="creative-switcher" aria-label={m.creativeSet.switcher}>{campaign.concepts.map((item, index) => item.approved && campaign.planRevision === campaign.inputRevision ? <Link key={item.id} aria-current={item.id === concept.id ? 'page' : undefined} onClick={() => { requestId.current++; abort.current?.abort(); void studio.flush(); }} href={`/studio/${campaign.id}?concept=${item.id}`}>{m.creativeSet.open.replace('{number}', String(index + 1))} · {m.campaign.angles[item.angle]}</Link> : <span key={item.id}>{m.creativeSet.open.replace('{number}', String(index + 1))} · {m.campaign.pending}</span>)}</nav>
    {exportNotice&&exportNotice.signature===fingerprint(creative)&&<p role="status" data-testid="export-preflight">{exportNotice.text}</p>}<StudioTools creative={creative} campaign={campaign} handle={handle} ready={ready} markers={markers} setMarkers={setMarkers}/>
    {activeIssue&&<IssueFix key={activeIssue.id} issue={activeIssue} creative={creative} handle={handle} onClose={()=>setActiveIssue(null)}/>}
    {!approved && <p className="campaign-notice">{s.stale}</p>}
    <div className="studio-tabs" role="tablist" aria-label={s.panels}>{(['layers', 'edit', 'generate', 'review', 'export'] as const).map(id => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{s.tabs[id]}</button>)}</div>
    <div className="studio-layout"><aside className={`studio-layers studio-panel ${tab === 'layers' ? 'active' : ''}`}><h2>{s.layersTitle}</h2><ul>{[...creative.layers].reverse().map(item => <li key={item.id}><button aria-pressed={layer?.id === item.id} onClick={() => { setSelected(item.id); setTab('edit'); }}>{s.kinds[item.kind]}</button></li>)}</ul><label htmlFor="creative-template">{s.template}</label><select id="creative-template" value={creative.appliedTemplate ?? ''} onChange={event => { const value = event.target.value as TemplateId; if (value) studio.update({ ...creative, appliedTemplate: value, layers: applyTemplate(creative.layers, value, dimensions) }); }}><option value="">{s.templateChoose}</option>{TEMPLATE_IDS.map(id => <option key={id} value={id}>{s.templates[id]}</option>)}</select>{creative.appliedTemplate && <p>{s.templateCurrent.replace('{template}', s.templates[creative.appliedTemplate])}</p>}<p>{s.templateHelp}</p><p>{s.layerHelp}</p></aside>
      <div className="studio-art"><div className="studio-zoom"><label htmlFor="studio-zoom">{s.zoom}</label><select id="studio-zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>{s.fit}</option><option value={1.5}>150%</option><option value={2}>200%</option></select></div>
        {fontsReady && <DesignCanvas key={creative.id} placement={creative.placement} findings={(tab==='review'||wide)&&markers?issues:[]} onIssue={setActiveIssue} layers={creative.layers} assets={studio.assets} selected={layer?.id ?? null} select={setSelected} patch={studio.patch} zoom={zoom} handle={handle} ready={ready} onReady={onReady} label={s.canvasLabel} rtl={campaign.creativeLanguage === 'ar'} disabled={busy} dimensions={dimensions} polish={creative.polish}/>}<p className="field-help">{ready ? s.canvasHelp : s.preparing}</p>
      </div><div className="studio-inspector">
        <section className={`studio-panel ${tab === 'edit' ? 'active' : ''}`} data-panel="edit"><h2>{s.editTitle}</h2>{layer && <fieldset disabled={busy}>
          <legend>{s.kinds[layer.kind]}</legend><label><input type="checkbox" checked={layer.visible} onChange={event => patch({ visible: event.target.checked })}/>{s.visible}</label>
          {['headline', 'brand', 'cta'].includes(layer.kind) && <><label htmlFor="layer-text">{s.text}</label><textarea id="layer-text" maxLength={500} value={layer.text} dir={resolveLayerDirection(layer)} onChange={event => patch({ text: event.target.value })}/><label htmlFor="layer-font">{s.font}</label><select id="layer-font" value={layer.fontFamily} onChange={event => patch({ fontFamily: event.target.value as 'Inter' | 'Cairo' })}><option>Inter</option><option>Cairo</option></select><label htmlFor="layer-dir">{s.direction}</label><select id="layer-dir" value={layer.dir ?? 'auto'} onChange={event => patch({ dir: event.target.value as 'auto' | 'ltr' | 'rtl' })}><option value="auto">{s.directionAuto}</option><option value="ltr">{s.directionLtr}</option><option value="rtl">{s.directionRtl}</option></select><label htmlFor="layer-font-size">{s.fontSize}</label><input id="layer-font-size" type="number" min={12} max={160} value={layer.fontSize} onChange={event => patch({ fontSize: Number(event.target.value) })}/><label htmlFor="layer-color">{s.textColor}</label><input id="layer-color" type="color" value={layer.color} onChange={event => patch({ color: event.target.value })}/></>}
          {['background', 'brand', 'cta', 'headline'].includes(layer.kind) && <><label htmlFor="layer-fill">{s.fill}</label><label><input type="checkbox" checked={layer.fill === 'transparent'} onChange={event => patch({ fill: event.target.checked ? 'transparent' : campaign.brandSnapshot.colors[1] })}/>{s.transparent}</label><input id="layer-fill" type="color" disabled={layer.fill === 'transparent'} value={layer.fill === 'transparent' ? '#ffffff' : layer.fill} onChange={event => patch({ fill: event.target.value })}/></>}
          {layer.kind !== 'background' && <div className="layer-coordinates">{(['x', 'y', 'width', 'height'] as const).map(field => <div key={field}><label htmlFor={`layer-${field}`}>{s.positions[field]}</label><input id={`layer-${field}`} type="number" min={field === 'x' || field === 'y' ? 0 : 24} max={field === 'x' || field === 'width' ? dimensions.width : dimensions.height} step={1} value={Math.round(layer[field])} onChange={event => patch({ [field]: Number(event.target.value) })}/></div>)}</div>}
          <div className="studio-actions"><button disabled={creative.layers.indexOf(layer) <= 1 || layer.kind === 'background'} onClick={() => { const layers = [...creative.layers], at = layers.findIndex(item => item.id === layer.id); [layers[at - 1], layers[at]] = [layers[at], layers[at - 1]]; studio.update({ ...creative, layers }); }}>{s.backward}</button><button disabled={creative.layers.indexOf(layer) === creative.layers.length - 1 || layer.kind === 'background'} onClick={() => { const layers = [...creative.layers], at = layers.findIndex(item => item.id === layer.id); [layers[at + 1], layers[at]] = [layers[at], layers[at + 1]]; studio.update({ ...creative, layers }); }}>{s.forward}</button></div>
        </fieldset>}</section>
        <section className={`studio-panel ${tab === 'generate' ? 'active' : ''}`} data-panel="generate"><h2>{s.backgroundTitle}</h2><p>{s.backgroundHelp}</p><strong>{imageModel ? `${imageModel.provider} / ${imageModel.modelId}` : s.noImageModel}</strong><p>{imageModel?.imageCapabilityConfirmed ? s.userConfirmed : s.modelHelp}</p><Link href="/settings">{m.campaign.openSettings} ↗</Link>
          <div className="vision-first"><h3>{s.visionTitle}</h3><p>{s.visionHelp}</p>
          <button className="button secondary" disabled={visionBusy || !visionModel || !visionKey || !consent || !approved} onClick={() => void analyzeProduct()}>{visionBusy ? s.visionAnalyzing : s.visionAnalyze}</button>
          {error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
          {!visionModel && <p className="field-help">{s.visionUnavailable}</p>}
          {visionAnalysis && <fieldset><legend>{visionAnalysis.productCategory} · {visionAnalysis.material} · {visionAnalysis.mood}</legend>
            {visionAnalysis.sceneIdeas.map((idea, index) => <label key={index}><input type="radio" name="vision-scene" checked={selectedScene === index} onChange={() => setSelectedScene(index)} /><strong>{idea.scene}</strong> — {idea.setting}<br /><small>{idea.reason}</small></label>)}
          </fieldset>}
          {visionNote && <p role="status">{visionNote}</p>}</div>
          <label className="studio-consent"><input type="checkbox" checked={consent} disabled={busy || !approved || !imageReady || !key} onChange={event => setConsent(event.target.checked)}/><span>{m.common.consentShort}</span></label><details><summary>{m.common.consentDetails}</summary><p>{s.consent}</p></details><p>{s.billing}</p><button className="button primary" disabled={busy || !approved || !imageReady || !key || !consent} onClick={() => void generate()}>{busy ? s.generating : s.generate}</button>
          {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); requestId.current++; setBusy(false); setError('cancelled'); }}>{m.campaign.cancel}</button>}
          <div className="reference-block"><h3>{s.referenceTitle}</h3><p>{s.referenceHelp}</p>
          <button className="button secondary" disabled={referenceBusy || busy || !approved || !imageReady || !key || !consent || !product} onClick={() => void generateReference()}>{referenceBusy ? s.referenceGenerating : s.referenceGenerate}</button>
          {referenceAsset && referenceUrl && <div className="reference-side">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referenceUrl} alt={s.referenceAlt} className="reference-image"/>
            <p>{s.referenceOnly}</p>
            <button className="button secondary" disabled={layoutBusy || !visionModel || !visionKey || !consent} onClick={() => void analyzeReferenceLayout()}>{layoutBusy ? s.referenceAnalyzing : s.referenceAnalyze}</button>
            <button className="text-button" onClick={() => { studio.update({ ...creative, referenceAssetId: null }); setReferenceLayout(null); }}>{s.referenceClear}</button>
            {referenceLayout && <div className="reference-layout"><p>{s.referenceZones.replace('{product}', s.referenceZoneNames[referenceLayout.productZone]).replace('{headline}', s.referenceZoneNames[referenceLayout.headlineZone]).replace('{cta}', s.referenceZoneNames[referenceLayout.ctaZone])}</p><p>{referenceLayout.notes}</p><p>{s.referenceTemplate.replace('{template}', s.templates[referenceLayout.suggestedTemplate])}</p><button className="button primary" onClick={() => studio.update({ ...creative, appliedTemplate: referenceLayout.suggestedTemplate, layers: applyTemplate(creative.layers, referenceLayout.suggestedTemplate, dimensions) })}>{s.referenceApply}</button></div>}
          </div>}</div>
          <ProductMakeover/><div className="local-plan"><h3>{s.localTitle}</h3><p>{s.localHelp}</p><button className="button secondary" disabled={busy} onClick={localBackground}>{s.localButton}</button></div>
        </section><section className={`studio-panel ${tab === 'export' ? 'active' : ''}`} data-panel="export"><h2>{s.exportTitle}</h2><p>{s.exportHelp}</p><button className="button primary" disabled={!ready} onClick={download}>{s.download} ↗</button><label htmlFor="creative-caption">{m.campaign.fields.caption}</label><textarea id="creative-caption" disabled={busy} rows={5} maxLength={1200} value={creative.caption} dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => studio.update({ ...creative, caption: event.target.value })}/><p>{s.reviewLater}</p></section>
        <CriticPanel onFix={setActiveIssue} key={creative.id} creative={creative} creativeLanguage={campaign.creativeLanguage} assets={studio.assets} handleRef={handle} ready={ready} fontsReady={fontsReady} active={tab === 'review'} selectLayer={id => { setSelected(id); setTab('edit'); }}/>
      </div></div>{error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
  </section>;
}
