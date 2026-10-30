'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import OneshotCanvas, { type OneshotCanvasHandle } from './oneshot-canvas';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { ProviderError } from '@/lib/ai/errors';
import { extractedSchema, productBoxSchema } from '@/lib/ai/meta-contracts';
import { cutoutImage, SAM_PRODUCT_PROMPT } from '@/lib/cutout/provider';
import { encodeProduct, fitProductImage, validateGeneratedImage, validateProduct, requestPlan } from '@/lib/campaign/client';
import { initialOneshotLayout, toServerLayout, oneshotScore, verifyResultSchema, clampOneshotElement, scaleOneshotElement, type OneshotCanvasElement, type VerifyResult } from '@/lib/ai/oneshot';
import { resolveBrandFontFamily, brandFontStylesheetUrl, fontsForScript } from '@/lib/brand/fonts';
import { artBriefToScene, settingOf, type ArtBrief } from '@/lib/ai/art-brief';
import { inspectOneshotLayout, INSPECT_RULE_VERSION, type InspectCode } from '@/lib/oneshot/rules';
import { proposeOneshotRepairs, type RepairProposal } from '@/lib/oneshot/repair';
import { sha256Hex, buildManifest, mockupSignature } from '@/lib/evidence/manifest';
import { writeZip } from '@/lib/export/zip';
import { useObjectUrl } from './logo';
import { WaitingText } from './waiting';
import { saveAd, loadRecentScenes, rememberRecentScene } from '@/lib/db/repository';
import { loadDraft, saveDraft, clearDraft, draftHasWork } from '@/lib/oneshot/draft';
import { PLAN_DIALECTS, DIALECT_EXAMPLE, dialectLanguage, type PlanDialect } from '@/lib/campaign/dialects';
import { IconArrow, IconCheck } from './ui/icons';
import UploadCard from './upload-card';
import { AgentPipeline, type RepairRecord } from './agent-pipeline';
import { CertificateCard, TrustPanel } from './certificate-card';
import { SizeSet } from './size-set';
import { CanvasTools, MAX_ELEMENTS } from './canvas-tools';
import { removeLogoBackground } from '@/lib/oneshot/logo-background';
import { emptyRecords, redactForDetails, repairNotes, REPAIR_THRESHOLD, type AgentRecords, type AgentStepId, type StepRecord } from '@/lib/agent/pipeline';
import type { Brand } from '@/lib/db/schema';
import type { BrandInput } from '@/lib/db/schema';

const DEFAULT_TEXT_COLOR = '#16100C';

type Attempt = { blob: Blob; certificate: VerifyResult | null; score: number | null };

type Concept = { angle: string; title: string; headline: string; caption: string; visualDirection: string; artBrief?: ArtBrief };

function AttemptCard({ attempt, label, scoreLabel, active, useLabel, activeLabel, onUse }: { attempt: Attempt; label: string; scoreLabel: string; active: boolean; useLabel: string; activeLabel: string; onUse: () => void }) {
  const url = useObjectUrl(attempt.blob);
  return <figure className={active ? 'attempt-card active' : 'attempt-card'} data-testid="oneshot-attempt">
    {url && <img src={url} alt={label} />}
    <figcaption><strong>{label}</strong>{attempt.score !== null && <span>{scoreLabel}: {attempt.score}</span>}</figcaption>
    <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" aria-pressed={active} disabled={active} onClick={onUse}>{active ? activeLabel : useLabel}</button>
  </figure>;
}

/**
 * One-shot ad studio (the site's single ad mode).
 * Flow: upload product (+optional logo) -> cutout -> optional brand extract
 * and 3 planner ideas -> arrange everything on the mockup canvas -> one
 * Meta images/edits call paints the finished ad -> a vision check scores
 * the result against the mockup (the fidelity certificate). The phone
 * number is painted by the model like every other element and checked by
 * the vision read-back only — no digits are drawn over the result, because
 * a drawn copy on top of the model's own digits ghosts and ruins the ad.
 */
export default function OneshotStudio() {
  const m = useMessages(), t = m.oneshot, workspace = useWorkspace(), provider = useProviderSession();
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [cutoutMethod, setCutoutMethod] = useState<'meta-sam' | null>(null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [logoMissing, setLogoMissing] = useState(false);
  const [logoNote, setLogoNote] = useState('');
  const [logoClearing, setLogoClearing] = useState(false);
  const [brand, setBrand] = useState<BrandInput>({ name: '', description: '', colors: ['#16100C', '#F5EEDF', '#7ED3E0'] });
  const [headlineFont, setHeadlineFont] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  // The copy dialect; starts from the interface language until the user picks one.
  const [pickedDialect, setDialect] = useState<PlanDialect | null>(null);
  const dialect: PlanDialect = pickedDialect ?? (workspace.locale === 'ar' ? 'ar_eg' : 'en');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<number | null>(null);
  const [suggestedFonts, setSuggestedFonts] = useState<string[]>([]);
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
  const [tapCutout, setTapCutout] = useState(false);
  const [error, setError] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [certificate, setCertificate] = useState<VerifyResult | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [generatedLayout, setGeneratedLayout] = useState<OneshotCanvasElement[] | null>(null);
  const [certSignature, setCertSignature] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // The visible agent: one record per pipeline step, plus the one repair loop.
  const [records, setRecords] = useState<AgentRecords>(emptyRecords);
  // Wizard: one step on screen at a time; direction drives the slide.
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [restored, setRestored] = useState(false);
  const [restoredNote, setRestoredNote] = useState(false);
  const [repair, setRepair] = useState<RepairRecord | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [past, setPast] = useState<OneshotCanvasElement[][]>([]);
  const [future, setFuture] = useState<OneshotCanvasElement[][]>([]);
  const prevElements = useRef(elements);
  const skipHistory = useRef(false);
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
  const record = (id: AgentStepId, patch: Partial<StepRecord>) => setRecords(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const startStep = (id: AgentStepId, request?: Record<string, unknown>) => record(id, { status: 'running', startedAt: Date.now(), endedAt: undefined, error: undefined, result: undefined, detail: request ? { request: redactForDetails(request) } : undefined });
  const finishStep = (id: AgentStepId, result: string, response?: unknown) => setRecords(previous => ({ ...previous, [id]: { ...previous[id], status: 'done', endedAt: Date.now(), result, detail: response === undefined ? previous[id].detail : { ...previous[id].detail, response } } }));
  const failStep = (id: AgentStepId, cause: unknown) => record(id, { status: 'failed', endedAt: Date.now(), error: metaErrorMessage(cause, errorText) });
  const imageNote = (blob: Blob) => `[${blob.type || 'image'} image, ${Math.round(blob.size / 1024)} KB]`;

  useEffect(() => { let alive = true; Promise.all([document.fonts.load('48px Inter'), document.fonts.load('48px Cairo')]).then(() => { if (alive) return; }); return () => { alive = false; }; }, []);
  // Load an extracted brand font from Google Fonts the first time it is
  // suggested, then redraw the canvas so the headline uses it.
  const injectedFonts = useRef(new Set<string>());
  const [, setFontTick] = useState(0);
  const loadFont = useCallback((family: string) => {
    if (injectedFonts.current.has(family)) return;
    injectedFonts.current.add(family);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = brandFontStylesheetUrl(family);
    document.head.appendChild(link);
    document.fonts.load(`48px "${family}"`).then(() => setFontTick(tick => tick + 1)).catch(() => {});
  }, []);
  useEffect(() => { if (headlineFont) loadFont(headlineFont); }, [headlineFont, loadFont]);
  const [moreFonts, setMoreFonts] = useState(false);
  const fontScript = dialectLanguage(dialect) === 'ar' ? 'arabic' : 'latin';
  // Opening the font list loads every family in it so each button previews its own face.
  useEffect(() => { if (moreFonts) for (const font of fontsForScript(fontScript)) loadFont(font.family); }, [moreFonts, fontScript, loadFont]);
  const onReady = (id: string) => setLoaded(previous => previous.has(id) ? previous : new Set([...previous, id]));
  const canvasReady = elements.filter(item => item.blob).every(item => loaded.has(item.id));
  const brandValid = brand.name.trim().length > 0 && brand.description.trim().length > 0;
  const hasLogo = elements.some(item => item.kind === 'logo');
  const selectedElement = elements.find(item => item.id === selected);

  async function runCutout(blob: Blob, geometric?: { box?: { left: number; top: number; right: number; bottom: number }; point?: { x: number; y: number } }): Promise<Blob> {
    // SAM-only: a failed or unconfigured SAM cutout is a visible error, never
    // a silent local fallback — the fallback used to hide every SAM failure.
    if (!segmentModel || !key) throw new ProviderError(!key ? 'missing_key' : 'sam_unavailable', 400);
    const result = await cutoutImage(blob, 'meta-sam', { apiKey: key, modelId: segmentModel.modelId, signal: AbortSignal.timeout(65000), ...(geometric?.box ? { box: geometric.box } : geometric?.point ? { point: geometric.point } : { prompt: SAM_PRODUCT_PROMPT }) });
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
      setTapCutout(false);
      setResultBlob(null); setCertificate(null); setScore(null);
      setGeneratedLayout(null); setCertSignature(null);
      setPast([]); setFuture([]);
      setSuggestedFonts([]);
      setAppliedRepairs([]);
      setRecords(emptyRecords()); setRepair(null); setAttempts([]);
      setLoaded(new Set());
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
  }

  /** Ask vision where the main product is. Any failure returns null: the text cutout is the fallback, never a blocker. */
  async function detectProductBox(blob: Blob): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
    if (!visionModel || !key) return null;
    try {
      const fitted = await fitProductImage(blob);
      const body = { providerId: 'meta', modelId: visionModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fitted) };
      startStep('locate', body);
      const response = await metaFetch('vision', '/api/ai/product-box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const box = productBoxSchema.parse(await response.json());
      finishStep('locate', t.agentBox.replace('{box}', [box.left, box.top, box.right, box.bottom].map(value => value.toFixed(2)).join(', ')), box);
      return box;
    } catch (cause) { failStep('locate', cause); return null; }
  }

  // SAM runs only when the user presses the button — never on upload.
  // Geometric first: a vision box tells SAM where the product is, so the
  // cutout no longer bets on the text grounding of one word. The noun
  // phrase is the fallback, and tapping the photo is the last resort.
  async function isolateBackground() {
    const blob = currentBlob ?? originalBlob;
    if (!blob || cutting) return;
    setError(''); setCutting(true); setTapCutout(false);
    try {
      const box = await detectProductBox(blob);
      startStep('cutout', { modelId: segmentModel?.modelId, prompt: box ? { box } : { text: SAM_PRODUCT_PROMPT } });
      if (box) { try { const cut = await runCutout(blob, { box }); finishStep('cutout', t.agentCutBox, imageNote(cut)); return; } catch { /* fall through to text */ } }
      try { const cut = await runCutout(blob); finishStep('cutout', t.agentCutText, imageNote(cut)); return; }
      catch (cause) {
        if (cause instanceof ProviderError && (cause.code === 'sam_no_mask' || cause.code === 'invalid_response')) { setTapCutout(true); setError(metaErrorMessage(cause, errorText)); failStep('cutout', cause); return; }
        throw cause;
      }
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); failStep('cutout', cause); }
    finally { setCutting(false); }
  }

  /** Tap-to-cut: the tap point becomes SAM's prompt, so a failed automatic cutout still has a manual rescue. */
  async function tapCutoutPhoto(event: { currentTarget: HTMLImageElement; clientX: number; clientY: number }) {
    const blob = currentBlob ?? originalBlob;
    if (!blob || cutting) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const point = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    setError(''); setCutting(true);
    startStep('cutout', { modelId: segmentModel?.modelId, prompt: { point } });
    try { const cut = await runCutout(blob, { point }); setTapCutout(false); finishStep('cutout', t.agentCutTap, imageNote(cut)); }
    catch (cause) { setError(metaErrorMessage(cause, errorText)); failStep('cutout', cause); }
    finally { setCutting(false); }
  }

  async function uploadLogo(file: File) {
    setError('');
    try {
      await validateProduct(file); placeLogo(file); setLogoMissing(false); setLogoNote('');
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
  }
  function placeLogo(blob: Blob) {
    setLogoBlob(blob);
    setElements(previous => {
      const logo = previous.find(item => item.kind === 'logo');
      if (logo) return previous.map(item => item.kind === 'logo' ? { ...item, blob } : item);
      if (!previous.some(item => item.kind === 'product')) return previous;
      return [...previous, { id: crypto.randomUUID(), kind: 'logo', x: 830, y: 40, width: 200, height: 80, blob }];
    });
  }
  /** Clear a flat logo background on the device: no request, no model. */
  async function clearLogo() {
    if (!logoBlob || logoClearing) return;
    setLogoClearing(true); setLogoNote('');
    try {
      const { blob, result } = await removeLogoBackground(logoBlob);
      if (blob) { placeLogo(blob); setLogoNote(t.logoCleared); }
      else setLogoNote(result.reason === 'busy_background' ? t.logoBusy : t.logoAlready);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setLogoClearing(false); }
  }

  /** Fill the studio from a saved brand kit: identity fields plus its logo.
   *  A brand whose saved logo cannot be resolved must never keep the
   *  previous brand's logo on screen: clear the logo slot and say so. */
  function applyBrand(saved: Brand) {
    setBrand({ name: saved.name, description: saved.description, colors: saved.colors });
    setRecords(previous => ({ ...previous, brand: { status: 'skipped', result: t.agentBrandKit.replace('{name}', saved.name) } }));
    const blob = saved.logoAssetId ? workspace.assets.find(asset => asset.id === saved.logoAssetId)?.blob ?? null : null;
    setLogoMissing(!!saved.logoAssetId && !blob);
    setLogoBlob(blob);
    setElements(previous => {
      if (!blob) return previous.filter(item => item.kind !== 'logo');
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
    if (appliedReturnBrand.current || workspace.phase === 'loading' || !restored || !returnBrandId) return;
    const found = workspace.brands.find(item => item.id === returnBrandId);
    if (!found) return;
    appliedReturnBrand.current = true;
    // Deferred: the set-state-in-effect rule forbids sync setState here.
    Promise.resolve().then(() => {
      setSelectedBrandId(found.id);
      applyBrandRef.current(found);
    });
    router.replace('/oneshot');
  }, [returnBrandId, workspace.phase, workspace.brands, router, restored]);

  // Restore the saved wizard progress once, before anything else applies.
  useEffect(() => {
    let alive = true;
    loadDraft().then(draft => {
      if (!alive) return;
      if (draftHasWork(draft)) {
        skipHistory.current = true;
        setOriginalBlob(draft.originalBlob); setCurrentBlob(draft.currentBlob); setCutoutBlob(draft.cutoutBlob);
        setCutoutMethod(draft.cutoutBlob ? 'meta-sam' : null); setLogoBlob(draft.logoBlob); setEnhance(draft.enhance);
        setBrand(draft.brand); setSelectedBrandId(draft.selectedBrandId); setHeadlineFont(draft.headlineFont);
        setBrief(draft.brief); setScene(draft.scene); setConcepts(draft.concepts); setSelectedConcept(draft.selectedConcept);
        setSuggestedFonts(draft.suggestedFonts); setElements(draft.elements); if (draft.dialect) setDialect(draft.dialect); setStep(Math.min(4, Math.max(0, draft.step)));
        setRestoredNote(true);
      }
    }).catch(() => {}).finally(() => { if (alive) setRestored(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!restored || !originalBlob) return;
    const timer = setTimeout(() => {
      void saveDraft({ version: 1, step, originalBlob, currentBlob, cutoutBlob, logoBlob, enhance, brand, selectedBrandId, headlineFont, brief, scene, concepts, selectedConcept, suggestedFonts, elements, dialect: pickedDialect ?? undefined, savedAt: new Date().toISOString() }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [restored, step, originalBlob, currentBlob, cutoutBlob, logoBlob, enhance, brand, selectedBrandId, headlineFont, brief, scene, concepts, selectedConcept, suggestedFonts, elements, pickedDialect]);

  /** Start over: drop the saved draft and every piece of this ad. */
  function startOver() {
    void clearDraft().catch(() => {});
    skipHistory.current = true;
    setOriginalBlob(null); setCurrentBlob(null); setCutoutBlob(null); setCutoutMethod(null); setLogoBlob(null); setLogoMissing(false);
    setEnhance(false); setEnhanceNote(''); setTapCutout(false); setSelectedBrandId('');
    setBrand({ name: '', description: '', colors: ['#16100C', '#F5EEDF', '#7ED3E0'] }); setHeadlineFont(null);
    setBrief(''); setDialect(null); setConcepts([]); setSelectedConcept(null); setSuggestedFonts([]); setScene(t.defaultScene);
    setElements([]); setSelected(null); setPast([]); setFuture([]); setAppliedRepairs([]); setLoaded(new Set());
    setResultBlob(null); setCertificate(null); setScore(null); setGeneratedLayout(null); setCertSignature(null);
    setRecords(emptyRecords()); setRepair(null); setAttempts([]); setError(''); setRestoredNote(false);
    setDirection('back'); setStep(0);
  }

  async function extractBrand() {
    const model = visionModel ?? plannerModel;
    if (!model || !key || !currentBlob) return;
    setBusy('extract'); setError('');
    try {
      const image = await encodeProduct(currentBlob);
      const body = { providerId: 'meta', modelId: model.modelId, apiKey: key, consent: true, imageConsent: true, image };
      startStep('brand', body);
      const response = await metaFetch('vision', '/api/ai/brand-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const result = extractedSchema.parse(await response.json());
      finishStep('brand', `${result.suggestedName} · ${result.primaryHex} ${result.secondaryHex} ${result.accentHex}`, result);
      setBrand({ name: result.suggestedName, description: (workspace.locale === 'ar' ? result.shortDescriptionAr : result.shortDescriptionEn) || result.suggestedName, colors: [result.primaryHex, result.secondaryHex, result.accentHex] });
      setHeadlineFont(resolveBrandFontFamily(result.fontFamily));
      setSelectedBrandId('');
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); failStep('brand', cause); }
    finally { setBusy(''); }
  }

  async function suggestIdeas() {
    if (!plannerModel || !key || !currentBlob || !brandValid) return;
    setBusy('ideas'); setError('');
    try {
      // The last few settings go along so every round of ideas lands somewhere new.
      const recent = await loadRecentScenes().catch(() => [] as string[]);
      const planBody = { providerId: 'meta' as const, apiKey: key, modelId: plannerModel.modelId, consent: true as const, imageConsent: true as const, brand, brief: brief.trim(), goal: 'awareness' as const, creativeLanguage: dialectLanguage(dialect), dialect, format: '1080x1350' as const, ...(recent.length ? { avoidScenes: recent } : {}), product: await encodeProduct(currentBlob) };
      startStep('ideas', planBody);
      const plan = await requestPlan(planBody, AbortSignal.timeout(65000));
      finishStep('ideas', plan.concepts.map(item => item.headline).join(' · '), plan);
      const next = plan.concepts.map(item => ({ angle: item.angle, title: item.title, headline: item.headline, caption: item.caption, visualDirection: item.visualDirection, ...(item.artBrief ? { artBrief: item.artBrief } : {}) }));
      setConcepts(next); pickConcept(next, 0);
      // The planner suggests up to three headline fonts with the ideas;
      // only allowlist families survive, in the planner's order.
      const fonts: string[] = [];
      for (const name of plan.fonts ?? []) { const resolved = resolveBrandFontFamily(name); if (resolved && !fonts.includes(resolved)) fonts.push(resolved); }
      setSuggestedFonts(fonts);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); failStep('ideas', cause); }
    finally { setBusy(''); }
  }

  function pickConcept(list: Concept[], index: number) {
    const concept = list[index]; if (!concept) return;
    setSelectedConcept(index); setScene(concept.artBrief ? artBriefToScene(concept.artBrief) : concept.visualDirection);
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
    if (elements.length >= MAX_ELEMENTS) return;
    const base = kind === 'text' ? { x: 140, y: 500, width: 800, height: 120, fontSize: 64 } : kind === 'phone' ? { x: 340, y: 1200, width: 400, height: 60, fontSize: 44 } : { x: 830, y: 1150, width: 200, height: 200 };
    const element: OneshotCanvasElement = { id: crypto.randomUUID(), kind, ...base, text, blob, color: DEFAULT_TEXT_COLOR };
    setElements(previous => [...previous, element]); setSelected(element.id);
  }

  /** One painting pass plus its review. `fixNotes` turns it into the repair retry. */
  async function paintAndReview(mockup: { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string }, layout: ReturnType<typeof toServerLayout>, sanitizedBrand: BrandInput, fixNotes?: string[]): Promise<Attempt> {
    if (!imageModel) throw new ProviderError('invalid_model', 400);
    const language = workspace.locale === 'ar' ? 'ar' : 'en';
    const body = { providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true, mockup, brand: sanitizedBrand, scene: scene.trim(), language, layout, ...(fixNotes ? { fixNotes } : {}) };
    if (!fixNotes) startStep('paint', body);
    setBusy('generate');
    const response = await metaFetch('image_edit', '/api/ai/oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
    await requireMetaSuccess(response);
    const result = await response.blob(); await validateGeneratedImage(result);
    if (!fixNotes) finishStep('paint', t.agentPainted, imageNote(result));
    // Finished ads save to the gallery automatically, so the variants
    // and themes pages can pick them up without re-uploading. A gallery
    // failure must never break the ad itself.
    void saveAd({ id: crypto.randomUUID(), blob: result, source: 'oneshot', brand: sanitizedBrand, headline: layout.find(element => element.kind === 'text')?.text ?? '', hasLogo: elements.some(item => item.kind === 'logo'), createdAt: new Date().toISOString(), scene: scene.trim(), format: '1080x1350', ...(cutoutBlob ? { cutout: cutoutBlob } : {}) }).catch(() => {});
    if (!fixNotes) void rememberRecentScene(concepts[selectedConcept ?? -1]?.artBrief?.setting ?? settingOf(scene)).catch(() => {});
    const verifyModel = visionModel ?? provider.taskModel('critic');
    if (!verifyModel) return { blob: result, certificate: null, score: null };
    setBusy('verify');
    const fitted = await fitProductImage(result);
    const verifyBody = { providerId: 'meta', modelId: verifyModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fitted), layout, language };
    if (!fixNotes) startStep('critic', verifyBody);
    const verifyResponse = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verifyBody), signal: AbortSignal.timeout(65000) });
    await requireMetaSuccess(verifyResponse);
    const verified = verifyResultSchema.parse(await verifyResponse.json());
    const attemptScore = oneshotScore(verified, hasLogo);
    if (!fixNotes) finishStep('critic', t.agentScore.replace('{score}', String(attemptScore)), verified);
    return { blob: result, certificate: verified, score: attemptScore };
  }

  function showAttempt(attempt: Attempt) {
    setResultBlob(attempt.blob);
    setCertificate(attempt.certificate); setScore(attempt.score);
    setCertSignature(attempt.certificate ? mockupSignature(elements, brand) : null);
  }

  async function generate() {
    if (!cutoutBlob || !imageModel || !key || !scene.trim() || !canvasHandle.current || !canvasReady) return;
    setBusy('generate'); setError(''); setCertificate(null); setScore(null); setCertSignature(null); setGeneratedLayout(null);
    setRepair(null); setAttempts([]);
    setRecords(previous => ({ ...previous, paint: { status: 'waiting' }, critic: { status: 'waiting' } }));
    let step: AgentStepId = 'paint';
    try {
      // The headline font must be loaded before the mockup export, or the
      // canvas falls back to Cairo/Inter and the model sees the wrong font.
      await document.fonts.ready;
      const mockup = await (await fetch(canvasHandle.current.exportPng())).blob();
      const fittedMockup = await fitProductImage(mockup);
      // Blank text boxes render nothing on the mockup; never send them as
      // quoted strings to the model.
      const layout = toServerLayout(elements).filter(element => element.kind !== 'text' && element.kind !== 'phone' ? true : (element.text?.trim().length ?? 0) > 0);
      // The deterministic check is a pipeline step too: recorded on the
      // exact layout that goes to the painter.
      record('check', { status: 'done', startedAt: Date.now(), endedAt: Date.now(), result: findings.length === 0 ? t.inspectOk : t.agentIssues.replace('{count}', String(findings.length)), detail: { response: findings } });
      // The evidence manifest describes this layout, not whatever the user
      // arranges afterwards.
      setGeneratedLayout(elements);
      const sanitizedBrand: BrandInput = { ...brand, colors: brand.colors.map(color => /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#16100C') as [string, string, string] };
      const encodedMockup = await encodeProduct(fittedMockup);
      const first = await paintAndReview(encodedMockup, layout, sanitizedBrand);
      setAttempts([first]); showAttempt(first);
      if (navigator.vibrate) navigator.vibrate(30);
      // One repair loop: a weak certificate sends the critic's notes back to
      // the painter for exactly one more attempt; both versions stay visible.
      const notes = first.certificate && first.score !== null && first.score < REPAIR_THRESHOLD ? repairNotes(first.certificate, hasLogo) : [];
      if (notes.length > 0) {
        step = 'critic';
        const started = Date.now();
        setRepair({ status: 'running', startedAt: started, firstScore: first.score ?? undefined, detail: { request: { fixNotes: notes } } });
        try {
          const second = await paintAndReview(encodedMockup, layout, sanitizedBrand, notes);
          setAttempts([first, second]);
          const better = (second.score ?? -1) > (first.score ?? -1) ? second : first;
          showAttempt(better);
          setRepair({ status: 'done', startedAt: started, endedAt: Date.now(), firstScore: first.score ?? undefined, secondScore: second.score ?? undefined, result: t.agentRepairResult.replace('{first}', String(first.score)).replace('{second}', String(second.score ?? '—')), detail: { request: { fixNotes: notes }, response: second.certificate } });
        } catch (cause) {
          setRepair({ status: 'failed', startedAt: started, endedAt: Date.now(), firstScore: first.score ?? undefined, error: metaErrorMessage(cause, errorText), detail: { request: { fixNotes: notes } } });
        }
      }
    } catch (cause) {
      setError(metaErrorMessage(cause, errorText));
      setRecords(previous => {
        const failing: AgentStepId = previous.paint.status === 'running' ? 'paint' : previous.critic.status === 'running' ? 'critic' : step;
        return { ...previous, [failing]: { ...previous[failing], status: 'failed', endedAt: Date.now(), error: metaErrorMessage(cause, errorText) } };
      });
    }
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
  // The headline carries the chosen brand font (from extraction or the
  // suggested-font picker); other texts keep the script default. The font
  // never travels to the server (stripped there).
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
  // Closed-loop repair: one deterministic proposal per finding, computed
  // from the same rule set as the inspect. Applying one is an ordinary
  // element change, so it lands in history (Undo reverses it) and the
  // inspect list re-runs on the new arrangement — that re-run IS the
  // verify step of the loop. No model is consulted anywhere in it.
  const [appliedRepairs, setAppliedRepairs] = useState<{ elementId: string; text: string }[]>([]);
  const proposals = useMemo(() => cutoutBlob ? proposeOneshotRepairs(elements, brand.colors) : [], [cutoutBlob, elements, brand]);
  const liveRepairs = appliedRepairs.filter(entry => elements.some(item => item.id === entry.elementId));
  function applyRepair(proposal: RepairProposal) {
    const before = elements.find(item => item.id === proposal.elementId);
    const label = before ? elementLabel(before.id) : proposal.elementId;
    const description = proposal.patch.color !== undefined
      ? `${label} recolored to ${proposal.patch.color}`
      : `${label} moved to (${proposal.patch.x}, ${proposal.patch.y})`;
    setElements(previous => previous.map(item => item.id === proposal.elementId ? { ...item, ...proposal.patch } : item));
    setAppliedRepairs(previous => [...previous, { elementId: proposal.elementId, text: description }]);
  }
  const generating = busy === 'generate' || busy === 'verify';
  const generateLabel = busy === 'generate' ? <WaitingText label={t.generating} /> : busy === 'verify' ? <WaitingText label={t.verifying} /> : resultBlob ? t.retry : t.generate;
  // Wizard steps: a step is reachable once every earlier step is complete;
  // completed steps stay clickable for going back.
  const steps = [
    { label: t.stepProduct, done: !!cutoutBlob, reason: t.needProduct },
    { label: t.stepBrand, done: brandValid, reason: t.needBrand },
    { label: t.stepIdea, done: scene.trim().length > 0, reason: t.needScene },
    { label: t.stepArrange, done: !!cutoutBlob && canvasReady, reason: t.needCanvas },
    { label: t.stepGenerate, done: !!resultBlob, reason: '' },
  ];
  const reachable = (index: number) => steps.slice(0, index).every(item => item.done);
  function goTo(index: number) {
    if (index === step || index < 0 || index > 4 || !reachable(index)) return;
    setDirection(index > step ? 'forward' : 'back'); setStep(index);
    document.getElementById('main')?.scrollIntoView({ block: 'start' });
  }
  const current = steps[step];
  const last = step === steps.length - 1;
  const nextBlocked = !last && !current.done;
  const panel = (index: number) => ({ hidden: step !== index, className: `wizard-panel enter-${direction}`, 'data-testid': `wizard-step-${index}` });

  return <main className="oneshot-studio wizard">
    <div className="wizard-head">
      <div><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      <div className="wizard-head-actions">
        <Link className="ui-btn ui-btn--secondary ui-btn--sm" href="/shelf">{t.shelfLink}</Link>
        {originalBlob && <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={startOver}>{t.startOver}</button>}
      </div>
    </div>
    {restoredNote && <p className="request-status" role="status">{t.draftRestored}</p>}
    <div className="wizard-layout">
    <nav className="wizard-rail" aria-label={t.stepperLabel}>
      <ol className="oneshot-stepper wizard-steps">
        {steps.map((item, index) => {
          // A step reads as done only once everything before it is done too.
          const finished = item.done && reachable(index);
          const state = index === step ? 'current' : finished ? 'done' : reachable(index) ? 'open' : 'locked';
          return <li key={item.label} className={state}>
            <button type="button" aria-label={item.label} aria-current={index === step ? 'step' : undefined} disabled={!reachable(index)} onClick={() => goTo(index)}>
              <span className="step-mark" aria-hidden="true">{finished && index !== step ? <IconCheck size={14} className="agent-check" /> : index + 1}</span>
              <span aria-hidden="true">{item.label}</span>
            </button>
            {index < steps.length - 1 && <span className="wizard-link" aria-hidden="true"><i style={{ transform: `scaleX(${finished ? 1 : 0})` }} /></span>}
          </li>;
        })}
      </ol>
    </nav>

    <div className="wizard-body">
    <section {...panel(0)}>
      <h2 id="wizard-title-0">{t.uploadProduct}</h2>
      <p className="wizard-lead">{t.stepProductLead}</p>
      <UploadCard testId="upload-card-product" title={t.uploadProduct} hint={t.uploadHintProduct} preview={cutoutUrl ?? originalUrl} state={cutting ? 'busy' : cutoutBlob ? 'done' : 'idle'} busyText={t.uploadCutting} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadProduct} onFile={file => void uploadProduct(file)} />
      <button type="button" className="button secondary" disabled={!originalBlob || cutting} onClick={() => void isolateBackground()}>{cutting ? <WaitingText label={t.isolateBackground} /> : t.isolateBackground}</button>
      {tapCutout && originalUrl && <div>
        <p>{t.cutoutTapHint}</p>
        <img data-testid="cutout-tap-photo" src={originalUrl} alt="" onClick={event => void tapCutoutPhoto(event)} style={{ maxWidth: '100%', cursor: 'crosshair' }} />
        <button type="button" className="button secondary" onClick={() => setTapCutout(false)}>{t.cutoutTapClose}</button>
      </div>}
      {cutoutMethod === 'meta-sam' && <p>{t.cutoutMethod}: {t.samCutout}</p>}
      {cutoutUrl && originalUrl && <div className="cutout-compare" data-testid="cutout-compare">
        <figure><img src={currentUrl ?? originalUrl} alt={t.cutoutBefore} /><figcaption>{t.cutoutBefore}</figcaption></figure>
        <figure className="cutout-after sam-reveal" key={cutoutUrl} data-testid="sam-reveal"><img src={cutoutUrl} alt={t.cutoutAfter} /><span className="sam-scan" aria-hidden="true" /><figcaption>{t.cutoutAfter}</figcaption></figure>
      </div>}
      <label className="check-label"><input type="checkbox" checked={enhance} disabled={!originalBlob || enhanceBusy || busy !== ''} onChange={event => void toggleEnhance(event.target.checked)} />{enhanceBusy ? <WaitingText label={t.enhanceBusy} /> : t.enhance}</label>
      {enhanceNote && <p role="status">{enhanceNote}</p>}
      {enhance && originalUrl && currentUrl && <div data-testid="oneshot-enhance-compare" style={{ display: 'flex', gap: 12 }}>
        <figure style={{ margin: 0 }}><img src={originalUrl} alt={t.enhanceOriginal} width={120} /><figcaption>{t.enhanceOriginal}</figcaption></figure>
        <figure style={{ margin: 0 }}><img src={currentUrl} alt={t.enhanceImproved} width={120} /><figcaption>{t.enhanceImproved}</figcaption></figure>
      </div>}
    </section>

    <section {...panel(1)}>
      <h2 id="wizard-title-1">{t.stepBrand}</h2>
      <p className="wizard-lead">{t.stepBrandLead}</p>
      <fieldset className="brand-pick-fieldset"><legend>{t.brandPick}</legend><div className="brand-pick-grid">
        <button type="button" className={selectedBrandId === '' ? 'brand-pick selected' : 'brand-pick'} aria-pressed={selectedBrandId === ''} onClick={() => { setSelectedBrandId(''); setLogoMissing(false); }}>{t.brandCustom}</button>
        {workspace.brands.map(item => <button type="button" key={item.id} className={selectedBrandId === item.id ? 'brand-pick selected' : 'brand-pick'} aria-pressed={selectedBrandId === item.id} onClick={() => { setSelectedBrandId(item.id); applyBrand(item); }}><span className="brand-pick-name">{item.name}</span><span className="brand-pick-swatches">{item.colors.map(color => <i key={color} style={{ background: color }} />)}</span></button>)}
      </div></fieldset>
      {logoMissing && <p role="alert">{t.brandLogoMissing}</p>}
      <UploadCard testId="upload-card-logo" title={t.uploadLogo} hint={t.uploadHintLogo} preview={logoUrl} state={logoBlob ? 'done' : 'idle'} busyText={t.uploadChoose} chooseText={t.uploadChoose} changeText={t.uploadChange} inputLabel={t.uploadLogo} onFile={file => void uploadLogo(file)} />
      {logoBlob && <div className="logo-clear">
        <button type="button" className="button secondary" disabled={logoClearing} onClick={() => void clearLogo()}>{logoClearing ? <WaitingText label={t.logoClearing} /> : t.logoClear}</button>
        {logoNote && <p role="status" data-testid="logo-note">{logoNote}</p>}
      </div>}
      <Link className="button secondary" href="/brands/new?returnTo=/oneshot">{t.brandNew} ↗</Link>
      {headlineFont && suggestedFonts.length === 0 && <p>{t.brandFont}: {headlineFont}</p>}
      <details>
        <summary>{t.editBrand}</summary>
        <label>{t.brandName}<input value={brand.name} maxLength={80} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, name: event.target.value })); }} /></label>
        <label>{t.brandDescription}<textarea value={brand.description} maxLength={500} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, description: event.target.value })); }} /></label>
        <div>{brand.colors.map((color, index) => <input key={index} dir="ltr" value={color} maxLength={7} aria-label={`color-${index + 1}`} onChange={event => { setSelectedBrandId(''); setBrand(previous => ({ ...previous, colors: previous.colors.map((item, i) => i === index ? event.target.value : item) as [string, string, string] })); }} />)}</div>
        <button type="button" className="button secondary" disabled={!currentBlob || !(visionModel ?? plannerModel) || !key || busy !== ''} onClick={() => void extractBrand()}>{busy === 'extract' ? <WaitingText label={t.extractBrand} /> : t.extractBrand}</button>
      </details>
    </section>

    <section {...panel(2)}>
      <h2 id="wizard-title-2">{t.stepIdea}</h2>
      <p className="wizard-lead">{t.stepIdeaLead}</p>
      <fieldset className="dialect-pick">
        <legend>{t.dialectLabel}</legend>
        <div className="dialect-grid" role="radiogroup" aria-label={t.dialectLabel}>
          {PLAN_DIALECTS.map(value => <button key={value} type="button" role="radio" aria-checked={dialect === value} className={dialect === value ? 'dialect-chip selected' : 'dialect-chip'} onClick={() => setDialect(value)}>{t[`dialect_${value}`]}</button>)}
        </div>
        <p className="dialect-preview"><small>{t.dialectPreview}</small><span key={dialect} data-testid="dialect-preview" dir={dialectLanguage(dialect) === 'ar' ? 'rtl' : 'ltr'}>{DIALECT_EXAMPLE[dialect]}</span></p>
      </fieldset>
      <label>{t.briefOptional}<textarea value={brief} maxLength={2000} onChange={event => setBrief(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={!plannerModel || !key || !brandValid || busy !== ''} onClick={() => void suggestIdeas()}>{busy === 'ideas' ? <WaitingText label={t.getIdeas} /> : t.getIdeas}</button>
      {busy === 'ideas' && <div className="idea-grid" aria-hidden="true">{[0, 1, 2].map(index => <div key={index} className="idea-card idea-skeleton" />)}</div>}
      {concepts.length > 0 && <div>
        <h3>{t.pickIdea}</h3>
        <div className="idea-grid">{concepts.map((concept, index) => <button key={concept.angle} type="button" className="button secondary idea-card" style={{ animationDelay: `${index * 60}ms` }} aria-pressed={selectedConcept === index} onClick={() => pickConcept(concepts, index)}>
          <span className="idea-card-title">{concept.title} — {concept.headline}</span>
          {concept.artBrief && <span className="idea-brief" data-testid="idea-brief">
            <span><b>{t.briefSetting}</b> {concept.artBrief.setting}</span>
            <span><b>{t.briefLight}</b> {concept.artBrief.lighting}</span>
            <span><b>{t.briefCamera}</b> {concept.artBrief.camera}</span>
            <span className="idea-brief-palette" aria-label={t.briefPalette}>{concept.artBrief.palette.slice(0, 4).map(color => <i key={color} title={color} style={{ background: /^#[\da-f]{3,8}$/i.test(color) ? color : undefined }}>{/^#/.test(color) ? '' : color}</i>)}</span>
          </span>}
        </button>)}</div>
      </div>}
      <div className="font-pick" data-testid="font-pick">
        {suggestedFonts.length > 0 && <p>{t.suggestedFonts}</p>}
        <div className="font-pick-row">
          {suggestedFonts.map(family => <button key={family} type="button" className="button secondary font-chip" style={{ fontFamily: `"${family}"` }} aria-pressed={headlineFont === family} onClick={() => setHeadlineFont(family)}>{family}</button>)}
          <button type="button" className="button ghost font-more" aria-expanded={moreFonts} aria-controls="font-more-list" onClick={() => setMoreFonts(open => !open)}>{moreFonts ? t.fewerFonts : t.moreFonts}</button>
        </div>
        {moreFonts && <div id="font-more-list" className="font-pick-row font-more-list" role="group" aria-label={t.moreFonts}>
          {fontsForScript(fontScript).filter(font => !suggestedFonts.includes(font.family)).map(font => <button key={font.family} type="button" className="button secondary font-chip" style={{ fontFamily: `"${font.family}"` }} aria-pressed={headlineFont === font.family} onClick={() => setHeadlineFont(font.family)}><span className="font-sample" dir={fontScript === 'arabic' ? 'rtl' : 'ltr'}>{fontScript === 'arabic' ? 'إعلان' : 'Aa'}</span><small>{font.family}</small></button>)}
        </div>}
        {headlineFont && (suggestedFonts.length > 0 || moreFonts) && <p>{t.brandFont}: {headlineFont}</p>}
      </div>
      <label>{t.scene}<textarea value={scene} maxLength={1000} onChange={event => setScene(event.target.value)} /></label>
    </section>

    <section {...panel(3)}>
      <h2 id="wizard-title-3">{t.canvasTitle}</h2>
      <p className="wizard-lead">{t.canvasHelp}</p>
      {!cutoutBlob && <p>{t.needProduct}</p>}
      <div className="arrange-layout">
      {cutoutBlob && <div className="oneshot-canvas-wrap">
        <OneshotCanvas elements={canvasElements} selected={selected} select={setSelected} change={(id, values) => setElements(previous => previous.map(item => item.id === id ? { ...item, ...values } : item))} handle={canvasHandle} onReady={onReady} label={t.canvasTitle} disabled={busy !== ''} />
      </div>}
      <div className="arrange-tools">
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
      {cutoutBlob && <CanvasTools elements={elements} setElements={setElements} selected={selected} setSelected={setSelected} colors={brand.colors} disabled={busy !== ''} headlineFont={headlineFont} setHeadlineFont={setHeadlineFont} loadFont={loadFont} />}
      {cutoutBlob && <div>
        <h3>{t.inspectTitle}</h3>
        {findings.length === 0 ? <p>{t.inspectOk}</p> : <ul>
          {findings.map(finding => {
            const proposal = proposals.find(item => item.findingId === finding.id);
            return <li key={finding.id}>{findingText[finding.code]}: {finding.elementIds.map(elementLabel).join(', ')}{finding.detail ? ` (${finding.detail})` : ''} {proposal
              ? <button type="button" className="button secondary" disabled={busy !== ''} onClick={() => applyRepair(proposal)}>{t.fixApply}</button>
              : <span>{t.fixNone}</span>}</li>;
          })}
        </ul>}
        {liveRepairs.length > 0 && <div>
          <h4>{t.fixesApplied}</h4>
          <ul>
            {liveRepairs.map((entry, index) => <li key={`${entry.elementId}-${index}`}>{entry.text}</li>)}
          </ul>
          <p>{t.fixUndoNote}</p>
        </div>}
      </div>}
      </div>
      </div>
    </section>

    <section {...panel(4)}>
      <h2 id="wizard-title-4">{t.result}</h2>
      {!imageModel || !key ? <p>{t.missingKey}</p> : null}
      <div className="generate-layout">
      <AgentPipeline records={records} repair={repair} onRetry={{ locate: () => void isolateBackground(), cutout: () => void isolateBackground(), brand: () => void extractBrand(), ideas: () => void suggestIdeas(), paint: () => void generate(), critic: () => void generate(), repair: () => void generate() }} />
      <div className="generate-result">
      <div className={resultBlob ? 'result-frame filled' : 'result-frame'} data-testid="oneshot-result-frame">
        {generating
          ? <div className="generating-overlay" data-testid="oneshot-generating" role="status"><WaitingText label={busy === 'verify' ? t.verifying : t.generatingNote} /></div>
          : resultBlob && resultUrl
            ? <img data-testid="oneshot-result" className="oneshot-reveal" key={resultUrl} src={resultUrl} alt={t.result} />
            : <p>{t.resultEmpty}</p>}
      </div>
      {attempts.length === 2 && !generating && <div className="attempt-compare" data-testid="oneshot-attempts">
        <h3>{t.attemptsTitle}</h3>
        <p>{t.attemptsNote}</p>
        <div className="attempt-grid">{attempts.map((attempt, index) => <AttemptCard key={index} attempt={attempt} label={index === 0 ? t.attemptFirst : t.attemptRepaired} scoreLabel={t.score} active={attempt.blob === resultBlob} useLabel={t.attemptUse} activeLabel={t.attemptShown} onUse={() => showAttempt(attempt)} />)}</div>
      </div>}
      {resultBlob && resultUrl && <a className="button secondary" href={resultUrl} download="admorph-oneshot.png">{t.download}</a>}
      <button type="button" className="button secondary" disabled={!resultBlob || exporting} onClick={() => void exportEvidence()}>{exporting ? t.exportBusy : t.exportEvidence}</button>
      {resultBlob && originalBlob && !generating && <TrustPanel key={resultUrl ?? ''} original={originalBlob} productSource={currentBlob ?? originalBlob} result={resultBlob} layout={generatedLayout ?? elements} certificateValid={!!certificate} />}
      {resultBlob && !generating && <div className="result-next">
        <Link className="button secondary" href="/variants">{t.makeVariants}</Link>
        <Link className="button secondary" href="/themes">{t.makeSeasonal}</Link>
      </div>}
      {resultBlob && !generating && <SizeSet key={resultUrl ?? ""} ad={resultBlob} layout={toServerLayout(generatedLayout ?? elements)} brand={brand} language={workspace.locale === 'ar' ? 'ar' : 'en'} hasLogo={hasLogo} cutout={cutoutBlob} />}
      {certificate && score !== null && <CertificateCard certificate={certificate} score={score} hasLogo={hasLogo} />}
      </div>
      </div>
    </section>

    {error && <p className="wizard-error" role="alert">{error}</p>}
    </div>
    </div>

    <div className="sticky-generate wizard-bar">
      {nextBlocked && <p className="wizard-reason" data-testid="wizard-reason">{current.reason}</p>}
      <div className="wizard-bar-actions">
        <button type="button" className="button secondary wizard-back" disabled={step === 0 || generating} onClick={() => goTo(step - 1)}><IconArrow size={16} className="flip-back" />{t.back}</button>
        {last
          ? <button type="button" className="button primary" disabled={!canGenerate} onClick={() => void generate()}>{generateLabel}</button>
          : <button type="button" className="button primary wizard-next" disabled={nextBlocked} onClick={() => goTo(step + 1)}>{t.next}<IconArrow size={16} /></button>}
      </div>
    </div>
  </main>;
}
