'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import OneshotCanvas, { type OneshotCanvasHandle } from './oneshot-canvas';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { ProviderError } from '@/lib/ai/errors';
import { extractedSchema } from '@/lib/ai/meta-contracts';
import { cutoutImage, SAM_PRODUCT_PROMPT } from '@/lib/cutout/provider';
import { encodeProduct, fitProductImage, validateGeneratedImage, validateProduct, requestPlan } from '@/lib/campaign/client';
import { initialOneshotLayout, toServerLayout, oneshotScore, verifyResultSchema, type OneshotCanvasElement, type VerifyResult } from '@/lib/ai/oneshot';
import { useObjectUrl } from './logo';
import UploadCard from './upload-card';
import type { Brand } from '@/lib/db/schema';
import type { BrandInput } from '@/lib/db/schema';

const DEFAULT_TEXT_COLOR = '#16100C';
const ARABIC = /[\u0600-\u06FF]/;

type Concept = { angle: string; title: string; headline: string; caption: string; visualDirection: string };

async function pinPhoneText(base: Blob, phone: OneshotCanvasElement): Promise<Blob> {
  const url = URL.createObjectURL(base);
  try {
    const img = new window.Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, 1080, 1350);
    const rtl = ARABIC.test(phone.text ?? '');
    ctx.font = `${phone.fontSize ?? 44}px ${rtl ? 'Cairo' : 'Inter'}, sans-serif`;
    ctx.fillStyle = phone.color ?? DEFAULT_TEXT_COLOR; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(phone.text ?? '', phone.x + phone.width / 2, phone.y + phone.height / 2, phone.width);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('pin_failed');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * One-shot ad studio (the site's single ad mode).
 * Flow: upload product (+optional logo) -> cutout -> optional brand extract
 * and 3 planner ideas -> arrange everything on the mockup canvas -> one
 * Meta images/edits call paints the finished ad -> a vision check scores
 * the result against the mockup (the fidelity certificate). A phone-number
 * element is never trusted to the model alone: it can be pinned exactly.
 */
export default function OneshotStudio() {
  const m = useMessages(), t = m.oneshot, workspace = useWorkspace(), provider = useProviderSession();
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [cutoutMethod, setCutoutMethod] = useState<'meta-sam' | null>(null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [brand, setBrand] = useState<BrandInput>({ name: '', description: '', colors: ['#16100C', '#F5EEDF', '#7ED3E0'] });
  const [brief, setBrief] = useState('');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<number | null>(null);
  const [scene, setScene] = useState(t.defaultScene);
  const [elements, setElements] = useState<OneshotCanvasElement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [enhance, setEnhance] = useState(false);
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [enhanceNote, setEnhanceNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState('');
  const [cutting, setCutting] = useState(false);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [certificate, setCertificate] = useState<VerifyResult | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [pinPhone, setPinPhone] = useState(true);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const canvasHandle = useRef<OneshotCanvasHandle | null>(null);
  const resultUrl = useObjectUrl(resultBlob);
  const originalUrl = useObjectUrl(originalBlob);
  const currentUrl = useObjectUrl(currentBlob);
  const logoUrl = useObjectUrl(logoBlob);
  const cutoutUrl = useObjectUrl(cutoutBlob);

  const imageModel = provider.taskModel('image');
  const visionModel = provider.taskModel('vision');
  const plannerModel = provider.taskModel('planner');
  const segmentModel = provider.taskModel('segment');
  const key = provider.configs.meta.apiKey.trim();
  const errorText = { errors: m.settings.errors, aiError: m.meta.aiError };

  useEffect(() => { let alive = true; Promise.all([document.fonts.load('48px Inter'), document.fonts.load('48px Cairo')]).then(() => { if (alive) return; }); return () => { alive = false; }; }, []);
  const onReady = (id: string) => setLoaded(previous => previous.has(id) ? previous : new Set([...previous, id]));
  const canvasReady = elements.filter(item => item.blob).every(item => loaded.has(item.id));
  const brandValid = brand.name.trim().length > 0 && brand.description.trim().length > 0;
  const hasLogo = elements.some(item => item.kind === 'logo');
  const phoneElement = elements.find(item => item.kind === 'phone');
  const selectedElement = elements.find(item => item.id === selected);

  async function runCutout(blob: Blob): Promise<Blob> {
    // SAM-only: a failed or unconfigured SAM cutout is a visible error, never
    // a silent local fallback — the fallback used to hide every SAM failure.
    if (!segmentModel || !key) throw new ProviderError(!key ? 'missing_key' : 'sam_unavailable', 400);
    const result = await cutoutImage(blob, 'meta-sam', { apiKey: key, modelId: segmentModel.modelId, prompt: SAM_PRODUCT_PROMPT, signal: AbortSignal.timeout(65000) });
    setCutoutBlob(result.cutoutBlob); setCutoutMethod('meta-sam');
    setElements(previous => {
      const product = previous.find(item => item.kind === 'product');
      if (product) return previous.map(item => item.kind === 'product' ? { ...item, blob: result.cutoutBlob } : item);
      const layout = initialOneshotLayout(!!logoBlob);
      return layout.map(item => item.kind === 'product' ? { ...item, blob: result.cutoutBlob } : item.kind === 'logo' && logoBlob ? { ...item, blob: logoBlob } : item);
    });
    setLoaded(new Set());
    return result.cutoutBlob;
  }

  async function uploadProduct(file: File) {
    setError(''); setCutting(true);
    try {
      await validateProduct(file); const blob = file; setOriginalBlob(blob); setCurrentBlob(blob); setEnhance(false); setEnhanceNote('');
      await runCutout(blob);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setCutting(false); }
  }

  async function uploadLogo(file: File) {
    setError('');
    try {
      await validateProduct(file); const blob = file; setLogoBlob(blob);
      setElements(previous => {
        const logo = previous.find(item => item.kind === 'logo');
        if (logo) return previous.map(item => item.kind === 'logo' ? { ...item, blob } : item);
        if (!previous.some(item => item.kind === 'product')) return previous;
        return [...previous, { id: crypto.randomUUID(), kind: 'logo', x: 830, y: 40, width: 200, height: 80, blob }];
      });
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
  }

  /** Fill the studio from a saved brand kit: identity fields plus its logo. */
  function applyBrand(saved: Brand) {
    setBrand({ name: saved.name, description: saved.description, colors: saved.colors });
    const blob = saved.logoAssetId ? workspace.assets.find(asset => asset.id === saved.logoAssetId)?.blob ?? null : null;
    if (!blob) return;
    setLogoBlob(blob);
    setElements(previous => {
      const logo = previous.find(item => item.kind === 'logo');
      if (logo) return previous.map(item => item.kind === 'logo' ? { ...item, blob } : item);
      if (!previous.some(item => item.kind === 'product')) return previous;
      return [...previous, { id: crypto.randomUUID(), kind: 'logo', x: 830, y: 40, width: 200, height: 80, blob }];
    });
  }

  // A brand created from the "new brand" link returns here with ?brand=<id>;
  // apply it once, then drop the parameter so a reload stays on this page.
  const searchParams = useSearchParams();
  const router = useRouter();
  const applyBrandRef = useRef<(saved: Brand) => void>(() => {});
  useEffect(() => { applyBrandRef.current = applyBrand; });
  const appliedReturnBrand = useRef(false);
  const returnBrandId = searchParams.get('brand');
  useEffect(() => {
    if (appliedReturnBrand.current || workspace.phase === 'loading' || !returnBrandId) return;
    const found = workspace.brands.find(item => item.id === returnBrandId);
    if (!found) return;
    appliedReturnBrand.current = true;
    // Deferred: the set-state-in-effect rule forbids sync setState here.
    Promise.resolve().then(() => {
      setSelectedBrandId(found.id);
      applyBrandRef.current(found);
    });
    router.replace('/oneshot');
  }, [returnBrandId, workspace.phase, workspace.brands, router]);

  async function extractBrand() {
    const model = visionModel ?? plannerModel;
    if (!model || !key || !consent || !currentBlob) return;
    setBusy('extract'); setError('');
    try {
      const image = await encodeProduct(currentBlob);
      const response = await metaFetch('vision', '/api/ai/brand-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: model.modelId, apiKey: key, consent: true, imageConsent: true, image }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const result = extractedSchema.parse(await response.json());
      setBrand({ name: result.suggestedName, description: (workspace.locale === 'ar' ? result.shortDescriptionAr : result.shortDescriptionEn) || result.suggestedName, colors: [result.primaryHex, result.secondaryHex, result.accentHex] });
      setSelectedBrandId('');
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); setConsent(false); }
  }

  async function suggestIdeas() {
    if (!plannerModel || !key || !consent || !currentBlob || !brandValid || brief.trim().length < 8) return;
    setBusy('ideas'); setError('');
    try {
      const plan = await requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: brief.trim(), goal: 'awareness', creativeLanguage: workspace.locale === 'ar' ? 'ar' : 'en', format: '1080x1350', product: await encodeProduct(currentBlob) }, AbortSignal.timeout(65000));
      const next = plan.concepts.map(item => ({ angle: item.angle, title: item.title, headline: item.headline, caption: item.caption, visualDirection: item.visualDirection }));
      setConcepts(next); pickConcept(next, 0);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); setConsent(false); }
  }

  function pickConcept(list: Concept[], index: number) {
    const concept = list[index]; if (!concept) return;
    setSelectedConcept(index); setScene(concept.visualDirection);
    setElements(previous => previous.map(item => item.kind === 'text' && item.id === 'headline' ? { ...item, text: concept.headline } : item));
  }

  async function toggleEnhance(on: boolean) {
    if (!originalBlob || enhanceBusy) return;
    setEnhanceNote('');
    if (!on) {
      try { await runCutout(originalBlob); setCurrentBlob(originalBlob); setEnhance(false); }
      catch (cause) { setError(metaErrorMessage(cause, errorText)); }
      return;
    }
    const model = provider.taskModel('image_edit') ?? imageModel;
    if (!model || !key || !consent) { setEnhanceNote(t.enhanceNeedsSetup); return; }
    setEnhanceBusy(true); setError('');
    try {
      const response = await metaFetch('image_edit', '/api/ai/product-makeover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', apiKey: key, modelId: model.modelId, consent: true, imageConsent: true, image: await encodeProduct(originalBlob), mode: 'enhance', preset: 'clean', prompt: 'Improve this product photo: cleaner materials, nicer lighting and finish. Keep the exact product shape, proportions, colors, packaging and identity. Do not add, remove, or re-render any text, lettering, or logos.' }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const improved = await response.blob(); await validateGeneratedImage(improved);
      const fitted = await fitProductImage(improved);
      setCurrentBlob(fitted); await runCutout(fitted); setEnhance(true); setEnhanceNote(t.enhanceDone);
    } catch (cause) { setEnhanceNote(t.enhanceFailed); setError(metaErrorMessage(cause, errorText)); }
    finally { setEnhanceBusy(false); setConsent(false); }
  }

  function addElement(kind: 'text' | 'phone' | 'icon', blob?: Blob, text?: string) {
    const base = kind === 'text' ? { x: 140, y: 500, width: 800, height: 120, fontSize: 64 } : kind === 'phone' ? { x: 340, y: 1200, width: 400, height: 60, fontSize: 44 } : { x: 830, y: 1150, width: 200, height: 200 };
    const element: OneshotCanvasElement = { id: crypto.randomUUID(), kind, ...base, text, blob, color: DEFAULT_TEXT_COLOR };
    setElements(previous => [...previous, element]); setSelected(element.id);
  }

  async function generate() {
    if (!cutoutBlob || !imageModel || !key || !consent || !scene.trim() || !canvasHandle.current || !canvasReady) return;
    setBusy('generate'); setError(''); setCertificate(null); setScore(null);
    try {
      const mockup = await (await fetch(canvasHandle.current.exportPng())).blob();
      const fittedMockup = await fitProductImage(mockup);
      // Blank text boxes render nothing on the mockup; never send them as
      // quoted strings to the model.
      const layout = toServerLayout(elements).filter(element => element.kind !== 'text' && element.kind !== 'phone' ? true : (element.text?.trim().length ?? 0) > 0);
      const sanitizedBrand: BrandInput = { ...brand, colors: brand.colors.map(color => /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#16100C') as [string, string, string] };
      const response = await metaFetch('image_edit', '/api/ai/oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true, mockup: await encodeProduct(fittedMockup), brand: sanitizedBrand, scene: scene.trim(), language: workspace.locale === 'ar' ? 'ar' : 'en', layout }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      let result = await response.blob(); await validateGeneratedImage(result);
      if (pinPhone && phoneElement?.text) result = await pinPhoneText(result, phoneElement);
      setResultBlob(result);
      const verifyModel = visionModel ?? provider.taskModel('critic');
      if (verifyModel) {
        setBusy('verify');
        const fitted = await fitProductImage(result);
        const verifyResponse = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: verifyModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fitted), layout, language: workspace.locale === 'ar' ? 'ar' : 'en' }), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(verifyResponse);
        const certificate = verifyResultSchema.parse(await verifyResponse.json());
        setCertificate(certificate); setScore(oneshotScore(certificate, hasLogo));
      }
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); setConsent(false); }
  }

  const canGenerate = !!cutoutBlob && !!imageModel && !!key && canvasReady && scene.trim().length > 0 && brandValid && !busy;
  const selectedTextElement = selectedElement && (selectedElement.kind === 'text' || selectedElement.kind === 'phone') ? selectedElement : null;

  return <main>
    <h1>{t.title}</h1>
    <p>{t.subtitle}</p>

    <section className="feature-card">
      <h2>{t.uploadProduct}</h2>
      <UploadCard testId="upload-card-product" title={t.uploadProduct} hint={t.uploadHintProduct} preview={cutoutUrl ?? originalUrl} state={cutting ? 'busy' : cutoutBlob ? 'done' : 'idle'} busyText={t.uploadCutting} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadProduct} onFile={file => void uploadProduct(file)} />
      <UploadCard testId="upload-card-logo" title={t.uploadLogo} hint={t.uploadHintLogo} preview={logoUrl} state={logoBlob ? 'done' : 'idle'} busyText={t.uploadChoose} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadLogo} onFile={file => void uploadLogo(file)} />
      {cutoutMethod === 'meta-sam' && <p>{t.cutoutMethod}: {t.samCutout}</p>}
      <label>{t.brandPick}<select aria-label={t.brandPick} value={selectedBrandId} onChange={event => { const found = workspace.brands.find(item => item.id === event.target.value); if (found) { setSelectedBrandId(found.id); applyBrand(found); } else setSelectedBrandId(''); }}>
        <option value="">{t.brandCustom}</option>
        {workspace.brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <Link className="button secondary" href="/brands/new?returnTo=/oneshot">{t.brandNew} ↗</Link>
      <details>
        <summary>{t.editBrand}</summary>
        <label>{t.brandName}<input value={brand.name} maxLength={80} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, name: event.target.value })); }} /></label>
        <label>{t.brandDescription}<textarea value={brand.description} maxLength={500} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, description: event.target.value })); }} /></label>
        <div>{brand.colors.map((color, index) => <input key={index} dir="ltr" value={color} maxLength={7} aria-label={`color-${index + 1}`} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, colors: previous.colors.map((item, i) => i === index ? event.target.value : item) as [string, string, string] })); }} />)}</div>
        <button type="button" className="button secondary" disabled={!currentBlob || !(visionModel ?? plannerModel) || !key || !consent || busy !== ''} onClick={() => void extractBrand()}>{t.extractBrand}</button>
      </details>
      <label>{t.brief}<textarea value={brief} maxLength={2000} onChange={event => setBrief(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={!plannerModel || !key || !consent || !brandValid || brief.trim().length < 8 || busy !== ''} onClick={() => void suggestIdeas()}>{t.getIdeas}</button>
      {concepts.length > 0 && <div>
        <h3>{t.pickIdea}</h3>
        {concepts.map((concept, index) => <button key={concept.angle} type="button" className="button secondary" aria-pressed={selectedConcept === index} onClick={() => pickConcept(concepts, index)}>{concept.title} — {concept.headline}</button>)}
      </div>}
      <label>{t.scene}<textarea value={scene} maxLength={1000} onChange={event => setScene(event.target.value)} /></label>
    </section>

    <section className="feature-card">
      <h2>{t.canvasTitle}</h2>
      <p>{t.canvasHelp}</p>
      {!cutoutBlob && <p>{t.needProduct}</p>}
      {cutoutBlob && <OneshotCanvas elements={elements} selected={selected} select={setSelected} change={(id, values) => setElements(previous => previous.map(item => item.id === id ? { ...item, ...values } : item))} handle={canvasHandle} onReady={onReady} label={t.canvasTitle} disabled={busy !== ''} />}
      <div>
        <input aria-label={t.textPlaceholder} value={newText} maxLength={200} placeholder={t.textPlaceholder} onChange={event => setNewText(event.target.value)} />
        <button type="button" className="button secondary" disabled={!newText.trim() || !cutoutBlob} onClick={() => { addElement('text', undefined, newText.trim()); setNewText(''); }}>{t.addText}</button>
        <input aria-label={t.phonePlaceholder} value={newPhone} maxLength={40} placeholder={t.phonePlaceholder} dir="ltr" onChange={event => setNewPhone(event.target.value)} />
        <button type="button" className="button secondary" disabled={!newPhone.trim() || !cutoutBlob} onClick={() => { addElement('phone', undefined, newPhone.trim()); setNewPhone(''); }}>{t.addPhone}</button>
        <UploadCard testId="upload-card-icon" title={t.addIcon} hint={t.uploadHintIcon} preview={null} state={elements.some(item => item.kind === 'icon') ? 'done' : 'idle'} busyText={t.uploadChoose} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.addIcon} disabled={!cutoutBlob} onFile={async file => { try { await validateProduct(file); addElement('icon', file); } catch (cause) { setError(metaErrorMessage(cause, errorText)); } }} />
      </div>
      {selectedTextElement && <label>{t.selectedText}<input value={selectedTextElement.text ?? ''} maxLength={200} onChange={event => setElements(previous => previous.map(item => item.id === selectedTextElement.id ? { ...item, text: event.target.value } : item))} /></label>}
      {selected && <button type="button" className="button secondary" onClick={() => { setElements(previous => previous.filter(item => item.id !== selected)); setSelected(null); }}>{t.deleteSelected}</button>}
      <label className="check-label"><input type="checkbox" checked={enhance} disabled={!originalBlob || enhanceBusy || busy !== ''} onChange={event => void toggleEnhance(event.target.checked)} />{enhanceBusy ? t.enhanceBusy : t.enhance}</label>
      {enhanceNote && <p role="status">{enhanceNote}</p>}
      {enhance && originalUrl && currentUrl && <div data-testid="oneshot-enhance-compare" style={{ display: 'flex', gap: 12 }}>
        <figure style={{ margin: 0 }}><img src={originalUrl} alt={t.enhanceOriginal} width={120} /><figcaption>{t.enhanceOriginal}</figcaption></figure>
        <figure style={{ margin: 0 }}><img src={currentUrl} alt={t.enhanceImproved} width={120} /><figcaption>{t.enhanceImproved}</figcaption></figure>
      </div>}
    </section>

    <section className="feature-card">
      {!imageModel || !key ? <p>{t.missingKey}</p> : null}
      {!scene.trim() && <p>{t.needScene}</p>}
      {!brandValid && <p>{t.needBrand}</p>}
      <label className="check-label"><input type="checkbox" checked={consent} disabled={!canGenerate && !consent} onChange={event => setConsent(event.target.checked)} />{t.consent}</label>
      <label className="check-label"><input type="checkbox" checked={pinPhone} onChange={event => setPinPhone(event.target.checked)} />{t.pinPhone}</label>
      <button type="button" className="button primary" disabled={!canGenerate || !consent} onClick={() => void generate()}>{busy === 'generate' ? t.generating : busy === 'verify' ? t.verifying : resultBlob ? t.retry : t.generate}</button>
      {error && <p role="alert">{error}</p>}
    </section>

    {resultBlob && resultUrl && <section className="feature-card">
      <h2>{t.result}</h2>
      <img data-testid="oneshot-result" src={resultUrl} alt={t.result} style={{ maxWidth: '100%' }} />
      <a className="button secondary" href={resultUrl} download="admorph-oneshot.png">{t.download}</a>
    </section>}

    {certificate && score !== null && <section className="feature-card" data-testid="oneshot-certificate">
      <h2>{t.certificate}</h2>
      <p>{t.score}: {score}</p>
      <ul>
        <li>{t.productKept}: {certificate.productKept ? '✓' : '✗'} {certificate.productNote}</li>
        {hasLogo && <li>{t.logoKept}: {certificate.logoKept ? '✓' : '✗'} {certificate.logoNote}</li>}
        <li>{t.layoutKept}: {certificate.layoutKept ? '✓' : '✗'} {certificate.layoutNote}</li>
        {certificate.texts.map(item => <li key={item.id}>{item.expected}: {item.match ? '✓' : `✗ (${item.found})`}</li>)}
      </ul>
    </section>}
  </main>;
}
