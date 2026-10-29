'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { initialOneshotLayout, toServerLayout, oneshotScore, verifyResultSchema, clampOneshotElement, scaleOneshotElement, type OneshotCanvasElement, type VerifyResult } from '@/lib/ai/oneshot';
import { resolveBrandFontFamily, brandFontStylesheetUrl } from '@/lib/brand/fonts';
import { inspectOneshotLayout, INSPECT_RULE_VERSION, type InspectCode } from '@/lib/oneshot/rules';
import { sha256Hex, buildManifest, mockupSignature } from '@/lib/evidence/manifest';
import { writeZip } from '@/lib/export/zip';
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
  const [headlineFont, setHeadlineFont] = useState<string | null>(null);
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
  const [busy, setBusy] = useState('');
  const [cutting, setCutting] = useState(false);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [certificate, setCertificate] = useState<VerifyResult | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [generatedLayout, setGeneratedLayout] = useState<OneshotCanvasElement[] | null>(null);
  const [certSignature, setCertSignature] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [past, setPast] = useState<OneshotCanvasElement[][]>([]);
  const [future, setFuture] = useState<OneshotCanvasElement[][]>([]);
  const prevElements = useRef(elements);
  const skipHistory = useRef(false);
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
  // Load an extracted brand font from Google Fonts the first time it is
  // suggested, then redraw the canvas so the headline uses it.
  const injectedFonts = useRef(new Set<string>());
  const [, setFontTick] = useState(0);
  useEffect(() => {
    if (!headlineFont || injectedFonts.current.has(headlineFont)) return;
    injectedFonts.current.add(headlineFont);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = brandFontStylesheetUrl(headlineFont);
    document.head.appendChild(link);
    document.fonts.load(`48px "${headlineFont}"`).then(() => setFontTick(tick => tick + 1)).catch(() => {});
  }, [headlineFont]);
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
      // The first cutout creates the layout; it is not an undoable edit.
      skipHistory.current = true;
      const layout = initialOneshotLayout(!!logoBlob);
      return layout.map(item => item.kind === 'product' ? { ...item, blob: result.cutoutBlob } : item.kind === 'logo' && logoBlob ? { ...item, blob: logoBlob } : item);
    });
    setLoaded(new Set());
    return result.cutoutBlob;
  }

  async function uploadProduct(file: File) {
    setError('');
    try {
      await validateProduct(file); const blob = file;
      setOriginalBlob(blob); setCurrentBlob(blob); setEnhance(false); setEnhanceNote('');
      // A new product starts a fresh mockup: the old cutout, layout, result
      // and certificate belong to the previous product, so none of it is
      // kept or recorded in history.
      skipHistory.current = true;
      setCutoutBlob(null); setCutoutMethod(null); setElements([]); setSelected(null);
      setResultBlob(null); setCertificate(null); setScore(null);
      setGeneratedLayout(null); setCertSignature(null);
      setPast([]); setFuture([]);
      setLoaded(new Set());
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
  }

  // SAM runs only when the user presses the button — never on upload.
  async function isolateBackground() {
    const blob = currentBlob ?? originalBlob;
    if (!blob || cutting) return;
    setError(''); setCutting(true);
    try { await runCutout(blob); }
    catch (cause) { setError(metaErrorMessage(cause, errorText)); }
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
    if (!model || !key || !currentBlob) return;
    setBusy('extract'); setError('');
    try {
      const image = await encodeProduct(currentBlob);
      const response = await metaFetch('vision', '/api/ai/brand-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: model.modelId, apiKey: key, consent: true, imageConsent: true, image }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const result = extractedSchema.parse(await response.json());
      setBrand({ name: result.suggestedName, description: (workspace.locale === 'ar' ? result.shortDescriptionAr : result.shortDescriptionEn) || result.suggestedName, colors: [result.primaryHex, result.secondaryHex, result.accentHex] });
      setHeadlineFont(resolveBrandFontFamily(result.fontFamily));
      setSelectedBrandId('');
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); }
  }

  async function suggestIdeas() {
    if (!plannerModel || !key || !currentBlob || !brandValid) return;
    setBusy('ideas'); setError('');
    try {
      const plan = await requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: brief.trim(), goal: 'awareness', creativeLanguage: workspace.locale === 'ar' ? 'ar' : 'en', format: '1080x1350', product: await encodeProduct(currentBlob) }, AbortSignal.timeout(65000));
      const next = plan.concepts.map(item => ({ angle: item.angle, title: item.title, headline: item.headline, caption: item.caption, visualDirection: item.visualDirection }));
      setConcepts(next); pickConcept(next, 0);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); }
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
    if (!model || !key) { setEnhanceNote(t.enhanceNeedsSetup); return; }
    setEnhanceBusy(true); setError('');
    try {
      const response = await metaFetch('image_edit', '/api/ai/product-makeover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', apiKey: key, modelId: model.modelId, consent: true, imageConsent: true, image: await encodeProduct(originalBlob), mode: 'enhance', preset: 'clean', prompt: 'Improve this product photo: cleaner materials, nicer lighting and finish. Keep the exact product shape, proportions, colors, packaging and identity. Do not add, remove, or re-render any text, lettering, or logos.' }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const improved = await response.blob(); await validateGeneratedImage(improved);
      const fitted = await fitProductImage(improved);
      setCurrentBlob(fitted); await runCutout(fitted); setEnhance(true); setEnhanceNote(t.enhanceDone);
    } catch (cause) { setEnhanceNote(t.enhanceFailed); setError(metaErrorMessage(cause, errorText)); }
    finally { setEnhanceBusy(false); }
  }

  /** Explicit touch-friendly move/resize for the selected element. */
  function resizeSelected(factor: number) {
    if (!selected) return;
    setElements(previous => previous.map(item => item.id === selected ? scaleOneshotElement(item, factor) : item));
  }
  function nudgeSelected(dx: number, dy: number) {
    if (!selected) return;
    setElements(previous => previous.map(item => item.id === selected ? clampOneshotElement({ ...item, x: item.x + dx, y: item.y + dy }) : item));
  }

  function addElement(kind: 'text' | 'phone' | 'icon', blob?: Blob, text?: string) {
    const base = kind === 'text' ? { x: 140, y: 500, width: 800, height: 120, fontSize: 64 } : kind === 'phone' ? { x: 340, y: 1200, width: 400, height: 60, fontSize: 44 } : { x: 830, y: 1150, width: 200, height: 200 };
    const element: OneshotCanvasElement = { id: crypto.randomUUID(), kind, ...base, text, blob, color: DEFAULT_TEXT_COLOR };
    setElements(previous => [...previous, element]); setSelected(element.id);
  }

  async function generate() {
    if (!cutoutBlob || !imageModel || !key || !scene.trim() || !canvasHandle.current || !canvasReady) return;
    setBusy('generate'); setError(''); setCertificate(null); setScore(null); setCertSignature(null); setGeneratedLayout(null);
    try {
      // The headline font must be loaded before the mockup export, or the
      // canvas falls back to Cairo/Inter and the model sees the wrong font.
      await document.fonts.ready;
      const mockup = await (await fetch(canvasHandle.current.exportPng())).blob();
      const fittedMockup = await fitProductImage(mockup);
      // Blank text boxes render nothing on the mockup; never send them as
      // quoted strings to the model.
      const layout = toServerLayout(elements).filter(element => element.kind !== 'text' && element.kind !== 'phone' ? true : (element.text?.trim().length ?? 0) > 0);
      // The evidence manifest describes this layout, not whatever the user
      // arranges afterwards.
      setGeneratedLayout(elements);
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
        setCertSignature(mockupSignature(elements, brand));
      }
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); }
  }

  // Evidence export: the finished PNG plus a manifest that can be checked
  // again later (hashes, deterministic checks, model IDs). Keys never enter
  // the manifest — only the model IDs the user selected.
  async function exportEvidence() {
    if (!resultBlob || !originalBlob || exporting) return;
    setExporting(true); setError('');
    try {
      const [originalProductHash, productSourceHash, finalExportHash] = await Promise.all([
        sha256Hex(originalBlob),
        sha256Hex(currentBlob ?? originalBlob),
        sha256Hex(resultBlob),
      ]);
      const layout = generatedLayout ?? elements;
      const manifest = buildManifest({
        creativeId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        originalProductHash, productSourceHash, finalExportHash,
        modelIds: { planner: plannerModel?.modelId, image: imageModel?.modelId, vision: visionModel?.modelId, segment: segmentModel?.modelId },
        ruleVersion: INSPECT_RULE_VERSION,
        layout,
        certificate,
        score,
        certificateStatus: certificate ? 'valid' : generatedLayout ? 'cleared_after_edit' : 'none',
      });
      const png = new Uint8Array(await resultBlob.arrayBuffer());
      const zip = writeZip([
        { name: 'admorph-oneshot.png', data: png },
        { name: 'evidence-manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
      ]);
      const url = URL.createObjectURL(new Blob([zip.slice()], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'admorph-evidence.zip'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setExporting(false); }
  }

  const canGenerate = !!cutoutBlob && !!imageModel && !!key && canvasReady && scene.trim().length > 0 && brandValid && !busy;
  const selectedTextElement = selectedElement && (selectedElement.kind === 'text' || selectedElement.kind === 'phone') ? selectedElement : null;
  // The headline carries the extracted brand font; other texts keep the
  // script default. The font never travels to the server (stripped there).
  const canvasElements = useMemo(() => headlineFont
    ? elements.map(item => item.id === 'headline' ? { ...item, fontFamily: headlineFont } : item)
    : elements, [elements, headlineFont]);

  // Undo/redo: every committed elements change is recorded, except changes
  // flagged with skipHistory (a fresh product, the first cutout, and the
  // undo/redo jumps themselves). The certificate is valid only while the
  // mockup and brand still match the verified snapshot.
  useEffect(() => {
    if (prevElements.current === elements) return;
    // Capture first: the setPast updater below runs later, after this line
    // would otherwise have overwritten the ref it reads.
    const previous = prevElements.current;
    prevElements.current = elements;
    if (skipHistory.current) { skipHistory.current = false; return; }
    setPast(past => [...past.slice(-49), previous]);
    setFuture([]);
  }, [elements]);
  useEffect(() => {
    if (!certificate || !certSignature) return;
    if (mockupSignature(elements, brand) !== certSignature) {
      // Deferred: the set-state-in-effect rule forbids sync setState here.
      Promise.resolve().then(() => { setCertificate(null); setScore(null); setCertSignature(null); });
    }
  }, [elements, brand, certificate, certSignature]);
  function undo() {
    const last = past.at(-1); if (!last) return;
    skipHistory.current = true;
    setPast(past.slice(0, -1));
    setFuture([elements, ...future]);
    setElements(last);
  }
  function redo() {
    const next = future[0]; if (!next) return;
    skipHistory.current = true;
    setPast([...past, elements]);
    setFuture(future.slice(1));
    setElements(next);
  }

  // Deterministic mockup check: geometry and contrast only, recomputed on
  // every committed arrangement. It never calls a model and never fixes
  // anything by itself — it only shows what is wrong, measured.
  const findings = useMemo(() => cutoutBlob ? inspectOneshotLayout(elements) : [], [cutoutBlob, elements]);
  function elementLabel(id: string): string {
    const el = elements.find(item => item.id === id);
    if (!el) return id;
    return el.text?.trim() ? `${el.kind} "${el.text.trim()}"` : el.kind;
  }
  const findingText: Record<InspectCode, string> = {
    overlap_product: t.findingOverlapProduct,
    overlap_text: t.findingOverlapText,
    overlap_logo: t.findingOverlapLogo,
    low_contrast: t.findingLowContrast,
    outside_safe_zone: t.findingSafeZone,
  };
  const generating = busy === 'generate' || busy === 'verify';
  const generateLabel = busy === 'generate' ? t.generating : busy === 'verify' ? t.verifying : resultBlob ? t.retry : t.generate;
  // Stepper state: the current step is the first incomplete one; later steps
  // read as locked until their prerequisites are done.
  const readyToGenerate = !!cutoutBlob && !!imageModel && !!key && canvasReady && scene.trim().length > 0 && brandValid;
  const steps = [
    { label: t.stepProduct, done: !!cutoutBlob },
    { label: t.stepBrand, done: brandValid },
    { label: t.stepIdea, done: concepts.length > 0 },
    { label: t.stepArrange, done: readyToGenerate },
    { label: t.stepGenerate, done: !!resultBlob },
  ];
  const currentStep = steps.findIndex(step => !step.done);

  return <main className="oneshot-studio">
    <h1>{t.title}</h1>
    <p>{t.subtitle}</p>
    <ol className="oneshot-stepper" aria-label={t.stepperLabel}>
      {steps.map((step, index) => {
        const state = step.done ? 'done' : index === currentStep ? 'current' : 'locked';
        return <li key={step.label} className={state} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="step-mark">{step.done ? '✓' : index + 1}</span>
          <span>{step.label}</span>
        </li>;
      })}
    </ol>

    <section className="feature-card">
      <h2>{t.uploadProduct}</h2>
      <UploadCard testId="upload-card-product" title={t.uploadProduct} hint={t.uploadHintProduct} preview={cutoutUrl ?? originalUrl} state={cutting ? 'busy' : cutoutBlob ? 'done' : 'idle'} busyText={t.uploadCutting} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadProduct} onFile={file => void uploadProduct(file)} />
      <button type="button" className="button secondary" disabled={!originalBlob || cutting} onClick={() => void isolateBackground()}>{t.isolateBackground}</button>
      <UploadCard testId="upload-card-logo" title={t.uploadLogo} hint={t.uploadHintLogo} preview={logoUrl} state={logoBlob ? 'done' : 'idle'} busyText={t.uploadChoose} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadLogo} onFile={file => void uploadLogo(file)} />
      {cutoutMethod === 'meta-sam' && <p>{t.cutoutMethod}: {t.samCutout}</p>}
      <label>{t.brandPick}<select aria-label={t.brandPick} value={selectedBrandId} onChange={event => { const found = workspace.brands.find(item => item.id === event.target.value); if (found) { setSelectedBrandId(found.id); applyBrand(found); } else setSelectedBrandId(''); }}>
        <option value="">{t.brandCustom}</option>
        {workspace.brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <Link className="button secondary" href="/brands/new?returnTo=/oneshot">{t.brandNew} ↗</Link>
      {headlineFont && <p>{t.brandFont}: {headlineFont}</p>}
      <details>
        <summary>{t.editBrand}</summary>
        <label>{t.brandName}<input value={brand.name} maxLength={80} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, name: event.target.value })); }} /></label>
        <label>{t.brandDescription}<textarea value={brand.description} maxLength={500} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, description: event.target.value })); }} /></label>
        <div>{brand.colors.map((color, index) => <input key={index} dir="ltr" value={color} maxLength={7} aria-label={`color-${index + 1}`} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, colors: previous.colors.map((item, i) => i === index ? event.target.value : item) as [string, string, string] })); }} />)}</div>
        <button type="button" className="button secondary" disabled={!currentBlob || !(visionModel ?? plannerModel) || !key || busy !== ''} onClick={() => void extractBrand()}>{t.extractBrand}</button>
      </details>
      <label>{t.briefOptional}<textarea value={brief} maxLength={2000} onChange={event => setBrief(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={!plannerModel || !key || !brandValid || busy !== ''} onClick={() => void suggestIdeas()}>{t.getIdeas}</button>
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
      {cutoutBlob && <div className="oneshot-canvas-wrap">
        <OneshotCanvas elements={canvasElements} selected={selected} select={setSelected} change={(id, values) => setElements(previous => previous.map(item => item.id === id ? { ...item, ...values } : item))} handle={canvasHandle} onReady={onReady} label={t.canvasTitle} disabled={busy !== ''} />
      </div>}
      <div>
        <input aria-label={t.textPlaceholder} value={newText} maxLength={200} placeholder={t.textPlaceholder} onChange={event => setNewText(event.target.value)} />
        <button type="button" className="button secondary" disabled={!newText.trim() || !cutoutBlob} onClick={() => { addElement('text', undefined, newText.trim()); setNewText(''); }}>{t.addText}</button>
        <input aria-label={t.phonePlaceholder} value={newPhone} maxLength={40} placeholder={t.phonePlaceholder} dir="ltr" onChange={event => setNewPhone(event.target.value)} />
        <button type="button" className="button secondary" disabled={!newPhone.trim() || !cutoutBlob} onClick={() => { addElement('phone', undefined, newPhone.trim()); setNewPhone(''); }}>{t.addPhone}</button>
        <UploadCard testId="upload-card-icon" title={t.addIcon} hint={t.uploadHintIcon} preview={null} state={elements.some(item => item.kind === 'icon') ? 'done' : 'idle'} busyText={t.uploadChoose} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.addIcon} disabled={!cutoutBlob} onFile={async file => { try { await validateProduct(file); addElement('icon', file); } catch (cause) { setError(metaErrorMessage(cause, errorText)); } }} />
      </div>
      {selectedTextElement && <label>{t.selectedText}<input value={selectedTextElement.text ?? ''} maxLength={200} onChange={event => setElements(previous => previous.map(item => item.id === selectedTextElement.id ? { ...item, text: event.target.value } : item))} /></label>}
      {selected && <button type="button" className="button secondary" onClick={() => { setElements(previous => previous.filter(item => item.id !== selected)); setSelected(null); }}>{t.deleteSelected}</button>}
      <button type="button" className="button secondary" disabled={past.length === 0 || busy !== ''} onClick={undo}>{t.undo}</button>
      <button type="button" className="button secondary" disabled={future.length === 0 || busy !== ''} onClick={redo}>{t.redo}</button>
      {selectedElement && <div role="group" aria-label={t.selectedControls}>
        <button type="button" className="button secondary" disabled={busy !== ''} onClick={() => resizeSelected(1.2)}>{t.enlarge}</button>
        <button type="button" className="button secondary" disabled={busy !== ''} onClick={() => resizeSelected(0.8)}>{t.shrink}</button>
        <button type="button" className="button secondary" aria-label={t.nudgeUp} disabled={busy !== ''} onClick={() => nudgeSelected(0, -10)}>↑</button>
        <button type="button" className="button secondary" aria-label={t.nudgeDown} disabled={busy !== ''} onClick={() => nudgeSelected(0, 10)}>↓</button>
        <button type="button" className="button secondary" aria-label={t.nudgeLeft} disabled={busy !== ''} onClick={() => nudgeSelected(-10, 0)}>←</button>
        <button type="button" className="button secondary" aria-label={t.nudgeRight} disabled={busy !== ''} onClick={() => nudgeSelected(10, 0)}>→</button>
      </div>}
      <label className="check-label"><input type="checkbox" checked={enhance} disabled={!originalBlob || enhanceBusy || busy !== ''} onChange={event => void toggleEnhance(event.target.checked)} />{enhanceBusy ? t.enhanceBusy : t.enhance}</label>
      {enhanceNote && <p role="status">{enhanceNote}</p>}
      {enhance && originalUrl && currentUrl && <div data-testid="oneshot-enhance-compare" style={{ display: 'flex', gap: 12 }}>
        <figure style={{ margin: 0 }}><img src={originalUrl} alt={t.enhanceOriginal} width={120} /><figcaption>{t.enhanceOriginal}</figcaption></figure>
        <figure style={{ margin: 0 }}><img src={currentUrl} alt={t.enhanceImproved} width={120} /><figcaption>{t.enhanceImproved}</figcaption></figure>
      </div>}
      {cutoutBlob && <div>
        <h3>{t.inspectTitle}</h3>
        {findings.length === 0 ? <p>{t.inspectOk}</p> : <ul>
          {findings.map(finding => <li key={finding.id}>{findingText[finding.code]}: {finding.elementIds.map(elementLabel).join(', ')}{finding.detail ? ` (${finding.detail})` : ''}</li>)}
        </ul>}
      </div>}
    </section>

    <section className="feature-card">
      <h2>{t.result}</h2>
      <div className={resultBlob ? 'result-frame filled' : 'result-frame'} data-testid="oneshot-result-frame">
        {generating
          ? <div className="generating-overlay" data-testid="oneshot-generating" role="status"><span>{busy === 'verify' ? t.verifying : t.generatingNote}</span></div>
          : resultBlob && resultUrl
            ? <img data-testid="oneshot-result" className="oneshot-reveal" key={resultUrl} src={resultUrl} alt={t.result} />
            : <p>{t.resultEmpty}</p>}
      </div>
      {resultBlob && resultUrl && <a className="button secondary" href={resultUrl} download="admorph-oneshot.png">{t.download}</a>}
      <button type="button" className="button secondary" disabled={!resultBlob || exporting} onClick={() => void exportEvidence()}>{exporting ? t.exportBusy : t.exportEvidence}</button>
      {certificate && score !== null && <div data-testid="oneshot-certificate">
        <h2>{t.certificate}</h2>
        <p>{t.score}: {score}</p>
        <ul>
          <li>{t.productKept}: {certificate.productKept ? '✓' : '✗'} {certificate.productNote}</li>
          {hasLogo && <li>{t.logoKept}: {certificate.logoKept ? '✓' : '✗'} {certificate.logoNote}</li>}
          <li>{t.layoutKept}: {certificate.layoutKept ? '✓' : '✗'} {certificate.layoutNote}</li>
          {certificate.texts.map(item => <li key={item.id}>{item.expected}: {item.match ? '✓' : `✗ (${item.found})`}</li>)}
        </ul>
      </div>}
    </section>

    <section className="feature-card">
      {!imageModel || !key ? <p>{t.missingKey}</p> : null}
      {!scene.trim() && <p>{t.needScene}</p>}
      {!brandValid && <p>{t.needBrand}</p>}
      <label className="check-label"><input type="checkbox" checked={pinPhone} onChange={event => setPinPhone(event.target.checked)} />{t.pinPhone}</label>
      <button type="button" className="button primary generate-main" disabled={!canGenerate} onClick={() => void generate()}>{generateLabel}</button>
      {error && <p role="alert">{error}</p>}
    </section>

    <div className="sticky-generate">
      <button type="button" className="button primary" disabled={!canGenerate} onClick={() => void generate()}>{generateLabel}</button>
    </div>
  </main>;
}
