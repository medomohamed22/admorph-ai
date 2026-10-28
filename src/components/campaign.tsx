'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCampaign } from './campaign-session';
import { useWorkspace, useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { useObjectUrl } from './logo';
import { providers } from '@/lib/ai/registry';
import { errorCode, type ErrorCode } from '@/lib/ai/errors';
import { encodeProduct, requestPlan, validateProduct } from '@/lib/campaign/client';
import { samplePlan } from '@/lib/campaign/sample';
import { SAMPLE_BRAND, canApprove, type Campaign, type ConceptField, type Plan } from '@/lib/campaign/schema';
import {ProductMakeover} from './product-makeover';
import {CopyShifter} from './copy-shifter';
import {measureCopy} from '@/lib/editor/measure-copy';
import {compose} from '@/lib/editor/composition';
import { SIZE_FORMATS, formatLabel } from '@/lib/editor/sizes';
import {spatialSchema} from '@/lib/editor/spatial';
import { CreativeSet } from './creative-set';

export function CampaignWorkspace() {
  const session = useCampaign(); const workspace = useWorkspace(); const provider = useProviderSession();
  const m = useMessages(); const c = m.campaign;
  const { draft, asset } = session;
  const url = useObjectUrl(asset?.blob ?? null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [productMode, setProductMode] = useState<'ready' | 'improve'>('ready');
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const currentDraft = useRef(draft);
  useEffect(() => { currentDraft.current = draft; }, [draft]);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) { setBusy(false); setRequesting(false); setConsent(false); } }); return () => { alive = false; }; }, [provider.keyEpoch]);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, [provider.keyEpoch]);
  const selection = provider.taskModel('planner');
  const modelReady = selection?.provider === 'meta';
  const key = selection ? provider.configs[selection.provider].apiKey.trim() : '';
  const validInput = !!draft && !!asset && draft.brief.trim().length >= 8;
  const stale = !!draft?.concepts.length && draft.planRevision !== draft.inputRevision;
  const approved = draft?.concepts.filter(item => item.approved).length ?? 0;
  function updateInput(patch: Partial<Campaign>) {
    if (!draft) return;
    setConsent(false); setError(null);
    session.update({ ...draft, ...patch, inputRevision: draft.inputRevision + 1, concepts: draft.concepts.map(item => ({ ...item, approved: false })) });
  }
  function applyPlan(plan: Plan, source: 'sample' | 'meta', snapshot: Campaign) {
    session.update({ ...snapshot, concepts: plan.concepts.map(item => ({ ...item, id: crypto.randomUUID(), approved: false })),
      source, planRevision: snapshot.inputRevision, planner: source === 'meta' ? selection : null });
  }
  async function upload(file: Blob) {
    setError(null);
    try { await validateProduct(file); session.replaceProduct(file); setConsent(false); }
    catch (cause) { setError(errorCode(cause)); }
  }
  async function fillSample() {
    if (!draft) return;
    setError(null); setBusy(true);
    try {
      const response = await fetch('/demo/sora-product.png'); if (!response.ok) throw new Error('sample_missing');
      const blob = await response.blob(); await validateProduct(blob);
      session.replaceProduct(blob, { ...draft, brandId: null, brandSnapshot: structuredClone(SAMPLE_BRAND), brief: c.sampleBrief,
        goal: 'awareness', concepts: [], source: 'draft', planRevision: null, planner: null }); setConsent(false);
    } catch { setError('product_image'); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!draft || !validInput || !selection || !modelReady || !key || !consent || busy) return;
    const id = ++requestId.current; const abort = new AbortController(); controller.current = abort;
    const snapshot = draft; setBusy(true); setRequesting(true); setError(null);
    try {
      const product = await encodeProduct(asset!.blob);
      if (abort.signal.aborted) return;
      const plan = await requestPlan({ providerId: 'meta', apiKey: key, modelId: selection.modelId,
        consent: true, imageConsent: true, brand: snapshot.brandSnapshot, brief: snapshot.brief, goal: snapshot.goal,
        creativeLanguage: snapshot.creativeLanguage, format: snapshot.format, product }, abort.signal);
      if (id === requestId.current && currentDraft.current?.id === snapshot.id && currentDraft.current.inputRevision === snapshot.inputRevision) applyPlan(plan, 'meta', snapshot);
    } catch (cause) { if (id === requestId.current) setError(errorCode(cause)); }
    finally { if (id === requestId.current) { setBusy(false); setRequesting(false); controller.current = null; } }
  }
  function cancel() { controller.current?.abort(); requestId.current++; setBusy(false); setRequesting(false); setError('cancelled'); }
  function edit(id: string, field: ConceptField, value: string) {
    if (draft) session.update({ ...draft, concepts: draft.concepts.map(item => item.id === id ? { ...item, [field]: value, approved: false } : item) });
  }
  if (!session.ready || !draft) return <section className="campaign-page"><p role="status">{c.loading}</p></section>;
  return <section className="campaign-page">
    <div className="campaign-heading"><div><span className="eyebrow">{c.eyebrow}</span><h1>{c.title}</h1><p>{c.description}</p></div>
      <button className="button secondary" disabled={busy} onClick={() => { setConsent(false); setError(null); void session.select(); }}>{c.newCampaign} ↗</button></div>
    <div className="campaign-toolbar"><label htmlFor="saved-campaign">{c.savedCampaigns}</label><select id="saved-campaign" value={draft.id} disabled={busy} onChange={event => { setConsent(false); setError(null); void session.select(event.target.value); }}>
      {![...session.campaigns].some(item => item.id === draft.id) && <option value={draft.id}>{draft.brandSnapshot.name} · {c.draft}</option>}
      {session.campaigns.map(item => <option key={item.id} value={item.id}>{item.brandSnapshot.name} · {item.brief.slice(0, 35) || c.draft}</option>)}
    </select><span role="status" data-testid="campaign-save">{c.save[session.saveState]}</span><button className="text-button" onClick={() => void session.flush()}>{c.saveNow}</button></div>
    <div className="campaign-layout"><div className="campaign-form panel">
      <div className="section-heading"><span className="eyebrow">{c.setup}</span><button className="text-button" disabled={busy} onClick={() => void fillSample()}>{c.fillSample} ↗</button></div>
      <label htmlFor="campaign-brand">{c.brand}</label><select id="campaign-brand" disabled={busy} value={draft.brandId ?? 'sample'} onChange={event => {
        const brand = workspace.brands.find(item => item.id === event.target.value);
        // The snapshot is the full brand identity: a hand-picked subset
        // would silently drop fields like the extracted wordmark weight.
        updateInput({ brandId: brand?.id ?? null, brandSnapshot: brand ? { name: brand.name, description: brand.description, colors: brand.colors, logoPlacement: brand.logoPlacement, logoAspectRatio: brand.logoAspectRatio, brandTone: brand.brandTone, shortDescriptionEn: brand.shortDescriptionEn, shortDescriptionAr: brand.shortDescriptionAr, recommendedFontEn: brand.recommendedFontEn, recommendedFontAr: brand.recommendedFontAr, wordmarkStyle: brand.wordmarkStyle, wordmarkBold: brand.wordmarkBold } : structuredClone(SAMPLE_BRAND) });
      }}><option value="sample">{c.sampleBrand}</option>{draft.brandId && !workspace.brands.some(item => item.id === draft.brandId) && <option value={draft.brandId}>{draft.brandSnapshot.name} · {c.brandSnapshot}</option>}{workspace.brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <p className="field-help"><Link href="/brands/new">{c.createBrand} ↗</Link> · {c.snapshotHelp}</p>
      <label htmlFor="product-image">{c.product}</label><div className="product-upload">{url ? /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt={c.productAlt} className="campaign-product"/> : <div className="product-placeholder" aria-hidden="true">✳</div>}
        <input id="product-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }}/><p className="field-help">{c.productHelp}</p></div>
      <label htmlFor="campaign-autocutout">{c.autoCutout}</label><select id="campaign-autocutout" disabled={busy} value={draft.autoCutout ?? 'off'} onChange={event => { const value = event.target.value as 'off' | 'sam' | 'local'; setConsent(false); setError(null); void session.update({ ...draft, autoCutout: value }); }}><option value="off">{c.autoCutoutOff}</option><option value="sam">{c.autoCutoutSam}</option><option value="local">{c.autoCutoutLocal}</option></select><p className="field-help">{c.autoCutoutHelp}</p>
      <fieldset><legend>{c.productModeLabel}</legend><label><input type="radio" checked={productMode === 'ready'} onChange={() => setProductMode('ready')} />{c.productModeReady}</label><label><input type="radio" checked={productMode === 'improve'} onChange={() => setProductMode('improve')} />{c.productModeImprove}</label></fieldset>
      <ProductMakeover startOpen={productMode === 'improve'} /><label htmlFor="campaign-brief">{c.brief}</label><textarea id="campaign-brief" rows={4} maxLength={2000} disabled={busy} value={draft.brief} onChange={event => updateInput({ brief: event.target.value })} placeholder={c.briefPlaceholder}/>
      <p className="field-help">{c.briefHelp} · {draft.brief.length}/2000</p>
      <div className="campaign-fields"><div><label htmlFor="campaign-goal">{c.goal}</label><select id="campaign-goal" disabled={busy} value={draft.goal} onChange={event => updateInput({ goal: event.target.value as Campaign['goal'] })}>{Object.entries(c.goals).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></div>
        <div><label htmlFor="creative-language">{c.language}</label><select id="creative-language" disabled={busy} value={draft.creativeLanguage} onChange={event => updateInput({ creativeLanguage: event.target.value as 'en' | 'ar' })}><option value="en">{c.english}</option><option value="ar">{c.arabic}</option></select></div></div>
      <p className="format-chip">{c.format}: <bdi>{formatLabel(draft.format)}</bdi></p>
      <label htmlFor="campaign-format">{c.format}</label><select id="campaign-format" disabled={busy} value={draft.format} onChange={event => updateInput({ format: event.target.value as Campaign['format'] })}>{SIZE_FORMATS.map(value => <option key={value} value={value}>{formatLabel(value)}</option>)}</select><p className="field-help">{c.formatHelp}</p>
    </div><aside className="campaign-planner panel"><span className="eyebrow">{c.planner}</span><h2>{c.plannerTitle}</h2>
      <div className="planner-selection"><strong>{selection ? providers[selection.provider].name : c.noPlanner}</strong><code>{selection?.modelId ?? c.chooseModel}</code></div>
      <p>{c.modelHelp}</p><Link href="/settings">{c.openSettings} ↗</Link>
      {selection && !modelReady && <p className="campaign-notice">{c.geminiOnly}</p>}
      {modelReady && !key && <p className="campaign-notice">{c.keyHelp}</p>}
      <label className="campaign-consent"><input type="checkbox" checked={consent} disabled={busy || !modelReady || !key || !validInput} onChange={event => setConsent(event.target.checked)}/><span>{m.common.consentShort}</span></label><details><summary>{m.common.consentDetails}</summary><p>{c.consent}</p></details>
      <p className="field-help">{c.billingHelp}</p>
      <button className="button primary" disabled={busy || !validInput || !modelReady || !key || !consent} onClick={() => void generate()}>{busy ? c.planning : c.generate} ↗</button>
      {requesting && <button className="button secondary" onClick={cancel}>{c.cancel}</button>}
      <div className="local-plan"><strong>{c.localTitle}</strong><p>{c.localHelp}</p><button className="button secondary" disabled={!validInput || busy} onClick={() => { setError(null); applyPlan(samplePlan(draft), 'sample', draft); }}>{c.localButton} ↗</button></div>
      {!validInput && <p className="field-help">{c.required}</p>}
      {error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
    </aside></div>
    <section className="concept-review" aria-labelledby="concept-heading"><div className="concept-heading"><div><span className="eyebrow">{c.review}</span><h2 id="concept-heading">{c.conceptsTitle}</h2></div><span className={`concept-source ${draft.source}`}>{c.sources[draft.source]}</span></div>
      {stale && <p className="campaign-notice" role="status">{c.stale}</p>}
      {!draft.concepts.length ? <div className="concept-empty"><span aria-hidden="true">✳</span><p>{c.empty}</p></div> : <>
        <p>{c.editHelp}</p><div className="concept-grid">{draft.concepts.map((concept, index) => <article className={`concept-card ${concept.approved ? 'approved' : ''}`} key={concept.id} data-testid="concept-card">
          <div className="section-heading"><span className="eyebrow">0{index + 1} / {c.angles[concept.angle]}</span><span>{concept.approved ? c.approved : c.pending}</span></div>
          <fieldset disabled={busy}><legend className="sr-only">{c.angles[concept.angle]}</legend>{(['title', 'audienceAngle', 'headline', 'caption', 'visualDirection'] as ConceptField[]).map(field => <div key={field}><label htmlFor={`${concept.id}-${field}`}>{c.fields[field]}</label>{field === 'caption' || field === 'visualDirection' ?
            <textarea id={`${concept.id}-${field}`} rows={4} maxLength={field === 'caption' ? 1200 : 1000} value={concept[field]} dir={draft.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => edit(concept.id, field, event.target.value)}/> :
            <input id={`${concept.id}-${field}`} maxLength={field === 'title' ? 100 : field === 'headline' ? 120 : 240} value={concept[field]} dir={draft.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => edit(concept.id, field, event.target.value)}/>}</div>)}</fieldset>
          <label>{m.meta.spatial}<select aria-label={m.meta.spatial} value={concept.spatialPreset??'top_copy_center_product'} onChange={e=>session.update({...draft,concepts:draft.concepts.map(item=>item.id===concept.id?{...item,spatialPreset:e.target.value as typeof concept.spatialPreset,approved:false}:item)})}>{spatialSchema.options.map((value,index)=><option key={value} value={value}>{m.meta.spatialPresets[index]}</option>)}</select></label>
          <CopyShifter contextKey={JSON.stringify([concept.spatialPreset,draft.creativeLanguage,draft.brandSnapshot])} headline={concept.headline} caption={concept.caption} brief={draft.brief} measure={copy=>measureCopy(compose(draft,concept,draft.productAssetId!,null),copy.headline,copy.ctaText,copy.locale)} onAccept={copy=>session.update({...draft,concepts:draft.concepts.map(item=>item.id===concept.id?{...item,headline:copy.headline,caption:copy.caption,ctaText:copy.ctaText,copyLocale:copy.locale,approved:false}:item)})}/>
          <button className={`button ${concept.approved ? 'secondary' : 'primary'}`} disabled={busy || stale || !asset || !canApprove(concept)} onClick={() => session.update({ ...draft, concepts: draft.concepts.map(item => item.id === concept.id ? { ...item, approved: !item.approved } : item) })}>{concept.approved ? c.reopen : c.approve} {concept.approved ? '↺' : '✓'}</button>
          {concept.approved && !stale && <Link className="button secondary" onClick={() => void session.flush()} href={`/studio/${draft.id}?concept=${concept.id}`}>{m.studio.open} ↗</Link>}
        </article>)}</div><div className="campaign-next"><strong>{approved}/3 {c.approvalCount}</strong><p>{approved === 3 && !stale ? c.readyNext : c.nextHelp}</p><p>{m.studio.oneAtATime}</p></div>
      </>}
    </section>
    {!!draft.concepts.length && <CreativeSet key={draft.id} campaign={draft} product={asset}/>}
  </section>;
}
