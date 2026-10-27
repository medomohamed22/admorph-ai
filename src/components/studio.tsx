'use client';
import {metaFetch} from '@/lib/ai/meta-fetch';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import { useCampaign } from './campaign-session';
import { useStudio } from './studio-session';
import { useWorkspace, useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { errorCode, ProviderError, type ErrorCode } from '@/lib/ai/errors';
import { conceptFieldsSchema } from '@/lib/campaign/schema';
import type { EditableLayer } from '@/lib/editor/schema';
import { readJsonLimited } from '@/lib/ai/transport';
import {StudioTools} from './studio-tools';
import {IssueFix} from './issue-fix';
import {ProductMakeover} from './product-makeover';
import {checkCreative,fingerprint} from '@/lib/critic/rules';
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
  const [selected, setSelected] = useState<string | null>(null), [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<'layers' | 'edit' | 'generate' | 'review' | 'export'>('edit');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [fontsReady, setFontsReady] = useState(false);
  const canvasScope = useMemo(() => ({ creativeId: creative?.id }), [creative?.id]);
  const [loaded, setLoaded] = useState<{ scope: object | null; ids: Set<string> }>({ scope: null, ids: new Set() }), [error, setError] = useState<ErrorCode | null>(null);
  const handle = useRef<CanvasHandle | null>(null), abort = useRef<AbortController | null>(null), requestId = useRef(0);
  const [wide,setWide]=useState(false),[exportNotice,setExportNotice]=useState<{signature:string;text:string}|null>(null);
  useEffect(()=>{const media=window.matchMedia('(min-width:751px)'),update=()=>setWide(media.matches);Promise.resolve().then(update);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const [markers,setMarkers]=useState(true),[issues,setIssues]=useState<Finding[]>([]),[activeIssue,setActiveIssue]=useState<Finding|null>(null);
  const onReady = useCallback((id: string) => setLoaded(previous => previous.scope === canvasScope ? previous.ids.has(id) ? previous : { scope: canvasScope, ids: new Set([...previous.ids, id]) } : { scope: canvasScope, ids: new Set([id]) }), [canvasScope]);
  useEffect(() => { let alive = true; Promise.all([document.fonts.load('48px Inter'), document.fonts.load('48px Cairo')]).then(() => { if (alive) setFontsReady(true); }); return () => { alive = false; }; }, []);
  useEffect(() => () => { requestId.current++; abort.current?.abort(); }, []);
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) { setBusy(false); setConsent(false); setSelected(null); setError(null); } }); return () => { alive = false; }; }, [campaignId, concept?.id, provider.keyEpoch]);
  useEffect(() => () => { requestId.current++; abort.current?.abort(); }, [campaignId, concept?.id, provider.keyEpoch]);
  const imageModel = provider.taskModel('image');
  const imageReady = imageModel?.provider === 'meta' ;
  const key = imageModel ? provider.configs[imageModel.provider].apiKey.trim() : '';
  const layer = creative?.layers.find(item => item.id === selected) ?? creative?.layers.find(item => item.kind === 'headline');
  const ready = fontsReady && !!creative && creative.layers.filter(item => item.visible && item.assetId).every(item => loaded.scope === canvasScope && loaded.ids.has(item.assetId!));
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{if(alive&&ready&&creative&&handle.current)setIssues(checkCreative(creative,handle.current.measureText(),new Set(studio.assets.map(asset=>asset.id))).issues);});return()=>{alive=false;};},[creative,ready,studio.assets]);
  async function generate() {
    if (!creative || !campaign || !concept || !approved || !imageReady || !imageModel || !key || !consent || busy) return;
    const id = ++requestId.current; const controller = new AbortController(); abort.current = controller; setBusy(true); setError(null);
    try {
      const response = await metaFetch('image','/api/ai/background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, approved: true,
          brand: campaign.brandSnapshot, concept: conceptFieldsSchema.parse({ angle: concept.angle, title: concept.title, audienceAngle: concept.audienceAngle, headline: concept.headline, caption: concept.caption, visualDirection: concept.visualDirection,spatialPreset:concept.spatialPreset,negativeSpaceInstruction:concept.negativeSpaceInstruction }) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
      if (!response.ok) {
        const body = await readJsonLimited(response, 32768) as { error?: { code?: ErrorCode } };
        throw new ProviderError(body.error?.code && body.error.code in m.settings.errors ? body.error.code : 'image_response', response.status);
      }
      const blob = await response.blob();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 3 * 1024 * 1024) throw new ProviderError('image_response');
      const url = URL.createObjectURL(blob);
      try { const image = new Image(); image.src = url; await image.decode(); if (image.width > 4096 || image.height > 4096) throw new ProviderError('image_response'); }
      finally { URL.revokeObjectURL(url); }
      if (requestId.current === id && !controller.signal.aborted) { studio.background(blob, 'meta', imageModel); setConsent(false); }
    } catch (cause) { if (requestId.current === id) setError(controller.signal.aborted ? 'cancelled' : errorCode(cause)); }
    finally { if (requestId.current === id) { setBusy(false); abort.current = null; } }
  }
  function localBackground() {
    if (!creative || !campaign || busy) return;
    setError(null); const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d')!; const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, campaign.brandSnapshot.colors[1]); gradient.addColorStop(1, campaign.brandSnapshot.colors[2]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = campaign.brandSnapshot.colors[0] + '22'; ctx.beginPath(); ctx.arc(830, 780, 580, 0, Math.PI * 2); ctx.fill();
    canvas.toBlob(blob => { if (blob) studio.background(blob, 'local', null); }, 'image/png');
  }
  function download() {
    setError(null);
    try { if(!ready||!creative||!handle.current)throw new Error();const checked=checkCreative(creative,handle.current.measureText(),new Set(studio.assets.map(asset=>asset.id)));setExportNotice({signature:fingerprint(creative),text:`${m.meta.preflight}: ${checked.issues.filter(issue=>issue.severity!=='info').length} · ${m.meta.preflightNote}`});const url = handle.current.exportPng(); const link = document.createElement('a'); link.href = url; link.download = `admorph-${creative?.id}.png`; link.click(); }
    catch { setError('export_error'); }
  }
  if (!session.ready) return <section className="studio-page"><p role="status">{s.loading}</p></section>;
  if (!campaign || !concept || !product) return <section className="studio-page"><h1>{s.missing}</h1><Link className="button primary" href="/campaigns/new">{s.back}</Link></section>;
  if (!creative && !approved) return <section className="studio-page"><h1>{s.approveFirst}</h1><Link className="button primary" href="/campaigns/new">{s.back}</Link></section>;
  if (!creative) return <section className="studio-page"><p role="status">{s.loading}</p></section>;
  const patch = (values: Partial<EditableLayer>) => { if (layer) studio.patch(layer.id, values); };
  return <section className="studio-page">
    <div className="studio-heading"><div><Link href="/campaigns/new">← {s.back}</Link><span className="eyebrow">{s.eyebrow}</span><h1>{s.title}</h1><p>{concept.title} · <bdi>1080 × 1350</bdi></p></div><div className="studio-actions"><button onClick={studio.undo} disabled={!studio.canUndo || busy}>{s.undo}</button><button onClick={studio.redo} disabled={!studio.canRedo || busy}>{s.redo}</button><button className="button secondary" onClick={() => { setTab('review'); requestAnimationFrame(() => document.getElementById('creative-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{m.critic.open}</button><button className="button primary" onClick={download} disabled={!ready}>{s.download} ↗</button></div></div>
    <div className="studio-status"><span role="status" data-testid="studio-save">{m.campaign.save[studio.saveState]}</span><button className="text-button" onClick={() => void studio.flush()}>{m.campaign.saveNow}</button><span>{s.sources[creative.source]}</span></div>
    <nav className="creative-switcher" aria-label={m.creativeSet.switcher}>{campaign.concepts.map((item, index) => item.approved && campaign.planRevision === campaign.inputRevision ? <Link key={item.id} aria-current={item.id === concept.id ? 'page' : undefined} onClick={() => { requestId.current++; abort.current?.abort(); void studio.flush(); }} href={`/studio/${campaign.id}?concept=${item.id}`}>{m.creativeSet.open.replace('{number}', String(index + 1))} · {m.campaign.angles[item.angle]}</Link> : <span key={item.id}>{m.creativeSet.open.replace('{number}', String(index + 1))} · {m.campaign.pending}</span>)}</nav>
    {exportNotice&&exportNotice.signature===fingerprint(creative)&&<p role="status" data-testid="export-preflight">{exportNotice.text}</p>}<StudioTools creative={creative} campaign={campaign} handle={handle} ready={ready} markers={markers} setMarkers={setMarkers}/>
    {activeIssue&&<IssueFix key={activeIssue.id} issue={activeIssue} creative={creative} handle={handle} onClose={()=>setActiveIssue(null)}/>}
    {!approved && <p className="campaign-notice">{s.stale}</p>}
    <div className="studio-tabs" role="tablist" aria-label={s.panels}>{(['layers', 'edit', 'generate', 'review', 'export'] as const).map(id => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{s.tabs[id]}</button>)}</div>
    <div className="studio-layout"><aside className={`studio-layers studio-panel ${tab === 'layers' ? 'active' : ''}`}><h2>{s.layersTitle}</h2><ul>{creative.layers.map(item => <li key={item.id}><button aria-pressed={layer?.id === item.id} onClick={() => { setSelected(item.id); setTab('edit'); }}>{s.kinds[item.kind]}</button></li>)}</ul><p>{s.layerHelp}</p></aside>
      <div className="studio-art"><div className="studio-zoom"><label htmlFor="studio-zoom">{s.zoom}</label><select id="studio-zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>{s.fit}</option><option value={1.5}>150%</option><option value={2}>200%</option></select></div>
        {fontsReady && <DesignCanvas key={creative.id} placement={creative.placement} findings={(tab==='review'||wide)&&markers?issues:[]} onIssue={setActiveIssue} layers={creative.layers} assets={studio.assets} selected={layer?.id ?? null} select={setSelected} patch={studio.patch} zoom={zoom} handle={handle} ready={ready} onReady={onReady} label={s.canvasLabel} rtl={campaign.creativeLanguage === 'ar'} disabled={busy}/>}<p className="field-help">{ready ? s.canvasHelp : s.preparing}</p>
      </div><div className="studio-inspector">
        <section className={`studio-panel ${tab === 'edit' ? 'active' : ''}`} data-panel="edit"><h2>{s.editTitle}</h2>{layer && <fieldset disabled={busy}>
          <legend>{s.kinds[layer.kind]}</legend><label><input type="checkbox" checked={layer.visible} onChange={event => patch({ visible: event.target.checked })}/>{s.visible}</label>
          {['headline', 'brand', 'cta'].includes(layer.kind) && <><label htmlFor="layer-text">{s.text}</label><textarea id="layer-text" maxLength={500} value={layer.text} dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => patch({ text: event.target.value })}/><label htmlFor="layer-font">{s.font}</label><select id="layer-font" value={layer.fontFamily} onChange={event => patch({ fontFamily: event.target.value as 'Inter' | 'Cairo' })}><option>Inter</option><option>Cairo</option></select><label htmlFor="layer-font-size">{s.fontSize}</label><input id="layer-font-size" type="number" min={12} max={160} value={layer.fontSize} onChange={event => patch({ fontSize: Number(event.target.value) })}/><label htmlFor="layer-color">{s.textColor}</label><input id="layer-color" type="color" value={layer.color} onChange={event => patch({ color: event.target.value })}/></>}
          {['background', 'brand', 'cta', 'headline'].includes(layer.kind) && <><label htmlFor="layer-fill">{s.fill}</label><input id="layer-fill" type="color" value={layer.fill} onChange={event => patch({ fill: event.target.value })}/></>}
          {layer.kind !== 'background' && <div className="layer-coordinates">{(['x', 'y', 'width', 'height'] as const).map(field => <div key={field}><label htmlFor={`layer-${field}`}>{s.positions[field]}</label><input id={`layer-${field}`} type="number" min={field === 'x' || field === 'y' ? 0 : 24} max={field === 'x' || field === 'width' ? 1080 : 1350} step={1} value={Math.round(layer[field])} onChange={event => patch({ [field]: Number(event.target.value) })}/></div>)}</div>}
          <div className="studio-actions"><button disabled={creative.layers.indexOf(layer) <= 1 || layer.kind === 'background'} onClick={() => { const layers = [...creative.layers], at = layers.findIndex(item => item.id === layer.id); [layers[at - 1], layers[at]] = [layers[at], layers[at - 1]]; studio.update({ ...creative, layers }); }}>{s.backward}</button><button disabled={creative.layers.indexOf(layer) === creative.layers.length - 1 || layer.kind === 'background'} onClick={() => { const layers = [...creative.layers], at = layers.findIndex(item => item.id === layer.id); [layers[at + 1], layers[at]] = [layers[at], layers[at + 1]]; studio.update({ ...creative, layers }); }}>{s.forward}</button></div>
        </fieldset>}</section>
        <section className={`studio-panel ${tab === 'generate' ? 'active' : ''}`} data-panel="generate"><h2>{s.backgroundTitle}</h2><p>{s.backgroundHelp}</p><strong>{imageModel ? `${imageModel.provider} / ${imageModel.modelId}` : s.noImageModel}</strong><p>{imageModel?.imageCapabilityConfirmed ? s.userConfirmed : s.modelHelp}</p><Link href="/settings">{m.campaign.openSettings} ↗</Link>
          <label className="studio-consent"><input type="checkbox" checked={consent} disabled={busy || !approved || !imageReady || !key} onChange={event => setConsent(event.target.checked)}/><span>{s.consent}</span></label><p>{s.billing}</p><button className="button primary" disabled={busy || !approved || !imageReady || !key || !consent} onClick={() => void generate()}>{busy ? s.generating : s.generate}</button>
          {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); requestId.current++; setBusy(false); setError('cancelled'); }}>{m.campaign.cancel}</button>}
          <ProductMakeover/><div className="local-plan"><h3>{s.localTitle}</h3><p>{s.localHelp}</p><button className="button secondary" disabled={busy} onClick={localBackground}>{s.localButton}</button></div>
        </section><section className={`studio-panel ${tab === 'export' ? 'active' : ''}`} data-panel="export"><h2>{s.exportTitle}</h2><p>{s.exportHelp}</p><button className="button primary" disabled={!ready} onClick={download}>{s.download} ↗</button><label htmlFor="creative-caption">{m.campaign.fields.caption}</label><textarea id="creative-caption" disabled={busy} rows={5} maxLength={1200} value={creative.caption} dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => studio.update({ ...creative, caption: event.target.value })}/><p>{s.reviewLater}</p></section>
        <CriticPanel onFix={setActiveIssue} key={creative.id} creative={creative} creativeLanguage={campaign.creativeLanguage} assets={studio.assets} handleRef={handle} ready={ready} fontsReady={fontsReady} active={tab === 'review'} selectLayer={id => { setSelected(id); setTab('edit'); }}/>
      </div></div>{error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
  </section>;
}
