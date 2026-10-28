'use client';
import {metaFetch} from '@/lib/ai/meta-fetch';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import { useCampaign } from './campaign-session';
import { useStudio } from './studio-session';
import { useWorkspace, useMessages } from './workspace';
import { cutoutImage, SAM_PRODUCT_PROMPT } from '@/lib/cutout/provider';
import { cutoutBottomRoughness } from '@/lib/cutout/quality';
import { findCutoutAsset } from '@/lib/cutout/provenance';
import { blobToBase64 } from '@/lib/cutout/raster';
import { buildVisionBrief, withStrictNegatives, visionBackgroundAnalysisSchema, checkBackgroundSchema, dominantColors, SCALE_GEOMETRY, type VisionBackgroundAnalysis, type CheckBackgroundResult } from '@/lib/background/brief';
import { useObjectUrl } from './logo';
import { resolveLayerDirection } from '@/lib/editor/direction';
import { dimensionsFor } from '@/lib/editor/sizes';
import { applyTemplate, TEMPLATE_IDS, type TemplateId } from '@/lib/editor/templates';
import { resolveTextOverlap } from '@/lib/editor/composition';
import { referenceLayoutSchema, type ReferenceLayout } from '@/lib/ai/reference';
import { writeZip } from '@/lib/export/zip';
import { validateProduct } from '@/lib/campaign/client';
import { getDatabase } from '@/lib/db/dexie';
import type { Asset } from '@/lib/db/schema';
import { useProviderSession } from './provider-session';
import { errorCode, ProviderError, type ErrorCode } from '@/lib/ai/errors';
import { conceptFieldsSchema } from '@/lib/campaign/schema';
import type { Creative, EditableLayer } from '@/lib/editor/schema';
import { clampLayer } from '@/lib/editor/schema';
import { productBackgroundContrast, textBackgroundContrast, PRODUCT_CONTRAST_MIN, TEXT_CONTRAST_MIN, type RgbaImage } from '@/lib/critic/pixels';
import { lightestBrandColor } from '@/lib/editor/brand-colors';
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
  type BackgroundReview = { productRatio: number | null; textLow: { id: string; ratio: number }[]; resized: boolean; textFixed: boolean; failed?: boolean; integrated?: boolean };
  const [bgReview, setBgReview] = useState<BackgroundReview | null>(null);
  /** Bottom-edge roughness of a fresh cutout; fail-open: a decode failure
   * never blocks the cutout, it just skips the warning. */
  async function roughCutoutBottom(blob: Blob): Promise<boolean> {
    try {
      const image = await decodeImage(blob);
      const rgba = drawToRgba(image, image.naturalWidth, image.naturalHeight);
      const alpha = new Uint8Array(rgba.width * rgba.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba.data[i * 4 + 3];
      return cutoutBottomRoughness(alpha, rgba.width, rgba.height).rough;
    } catch { return false; }
  }
  async function runCutout(mode: 'sam' | 'local') {
    if (!creative || !product || cutoutState === 'cutting') return;
    setCutoutState('cutting');
    setCutoutNote('');
    setCutoutMethod(null);
    let fellBack = false;
    try {
      let result;
      if (mode === 'sam' && samReady) {
        try {
          result = await cutoutImage(product.blob, 'meta-sam', { apiKey: samKey, modelId: segmentModel, prompt: SAM_PRODUCT_PROMPT });
        } catch {
          result = await cutoutImage(product.blob, 'local');
          setCutoutState('sam-fallback');
          setCutoutNote(m.cutout.samFallbackNote);
          fellBack = true;
        }
      } else {
        if (mode === 'sam') {
          setCutoutState('sam-fallback');
          setCutoutNote(m.cutout.samFallbackNote);
          fellBack = true;
        }
        result = await cutoutImage(product.blob, 'local');
      }
      const asset: Asset = { id: crypto.randomUUID(), kind: 'cutout', blob: result.cutoutBlob, createdAt: new Date().toISOString(), meta: { derivedFrom: product.id, provider: result.provider, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight, reliable: result.reliable } };
      try { await getDatabase().assets.put(asset); } catch { /* library save is best-effort; the creative still holds it */ }
      if (studio.replaceProductLayer(asset)) { setCutoutState((previous) => previous === 'sam-fallback' ? previous : 'done'); setCutoutMethod(result.provider); }
      if (!fellBack && await roughCutoutBottom(result.cutoutBlob)) setCutoutNote(m.cutout.roughBottomNote);
    } catch {
      setCutoutState('error');
      setCutoutNote(m.cutout.cutoutFailed);
    }
  }
  // Swap product: a new photo is cut out and placed on this same
  // background; text, logo and buttons stay untouched. The creative's
  // geometry does not change, so the new cutout inherits the fitted
  // product rect and its derived shadow follows automatically.
  const [swapFile, setSwapFile] = useState<File | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapNote, setSwapNote] = useState('');
  const [variants, setVariants] = useState<{ name: string; blob: Blob }[]>([]);
  const recentCutouts = useMemo(() => {
    const seen = new Set<string>();
    const out: Asset[] = [];
    for (const asset of studio.assets) {
      if (asset.kind !== 'cutout' || !asset.meta?.derivedFrom || seen.has(asset.meta.derivedFrom)) continue;
      seen.add(asset.meta.derivedFrom);
      out.push(asset);
    }
    return out.reverse();
  }, [studio.assets]);
  async function refreshSwapContrast(cutoutBlob: Blob) {
    if (!creative) return;
    const dims = dimensionsFor(creative.format);
    const bgLayer = creative.layers.find((item) => item.kind === 'background');
    const bgAsset = bgLayer?.assetId ? studio.assets.find((item) => item.id === bgLayer.assetId) : undefined;
    const productLayer = creative.layers.find((item) => item.kind === 'product');
    if (!bgAsset || !productLayer) return;
    try {
      const bg = drawToRgba(await decodeImage(bgAsset.blob), dims.width, dims.height);
      const prod = drawToRgba(await decodeImage(cutoutBlob), dims.width, dims.height, productLayer.x, productLayer.y, productLayer.width, productLayer.height);
      setBgReview({ productRatio: productBackgroundContrast(bg, prod, productLayer), textLow: bgReview?.textLow ?? [], resized: false, textFixed: false, integrated: false });
    } catch { /* contrast is informational; the swap itself already applied */ }
  }
  async function swapProduct() {
    if (!creative || !swapFile || swapBusy) return;
    setSwapBusy(true);
    setSwapNote('');
    try {
      await validateProduct(swapFile);
      const productAsset: Asset = { id: crypto.randomUUID(), kind: 'product', blob: swapFile, createdAt: new Date().toISOString() };
      try { await getDatabase().assets.put(productAsset); } catch { /* library save is best-effort */ }
      let result;
      if (samReady) {
        try { result = await cutoutImage(swapFile, 'meta-sam', { apiKey: samKey, modelId: segmentModel, prompt: SAM_PRODUCT_PROMPT }); }
        catch { result = await cutoutImage(swapFile, 'local'); }
      } else {
        result = await cutoutImage(swapFile, 'local');
      }
      const asset: Asset = { id: crypto.randomUUID(), kind: 'cutout', blob: result.cutoutBlob, createdAt: new Date().toISOString(), meta: { derivedFrom: productAsset.id, provider: result.provider, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight, reliable: result.reliable } };
      try { await getDatabase().assets.put(asset); } catch { /* library save is best-effort */ }
      if (!studio.replaceProductLayer(asset)) throw new Error('swap_failed');
      setCutoutMethod(result.provider);
      if (await roughCutoutBottom(result.cutoutBlob)) setSwapNote(m.cutout.roughBottomNote);
      await refreshSwapContrast(result.cutoutBlob);
    } catch {
      setSwapNote(s.swapFailed);
    } finally { setSwapBusy(false); }
  }
  async function snapshotVariant() {
    if (!ready || !creative || !handle.current) return;
    try {
      await document.fonts.ready;
      const url = handle.current.exportPng();
      const blob = await (await fetch(url)).blob();
      setVariants((previous) => [...previous, { name: `admorph-variant-${previous.length + 1}.png`, blob }]);
      setSwapNote(s.swapSnapshotSaved);
    } catch { /* snapshot is best-effort; the PNG download still works */ }
  }
  async function downloadVariantsZip() {
    if (variants.length === 0) return;
    const entries = await Promise.all(variants.map(async (variant) => ({ name: variant.name, data: new Uint8Array(await variant.blob.arrayBuffer()) })));
    const bytes = writeZip(entries);
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'admorph-variants.zip';
    link.click();
    URL.revokeObjectURL(url);
  }
  // Auto-cutout: when the campaign asks for it, a fresh creative uses the
  // library cutout for this product if one exists, otherwise segments once.
  // SAM failure is never silent: it falls back to local with a visible note.
  useEffect(() => {
    if (!creative || !campaign || !product) return;
    const layer = creative.layers.find((item) => item.kind === 'product');
    const layerAsset = studio.assets.find((item) => item.id === layer?.assetId);
    // The method line must survive reopening a creative whose layer is
    // already a cutout, whatever the auto-cutout mode — the cut is applied
    // work, not a new cut. Both the layer asset and a reused library asset
    // carry their provider in meta.
    if (layerAsset?.kind === 'cutout') {
      const method = layerAsset.meta?.provider;
      if (method) void Promise.resolve().then(() => setCutoutMethod(method));
      return;
    }
    const mode = campaign.autoCutout ?? 'off';
    if (mode === 'off' || cutoutState === 'cutting') return;
    const attemptKey = `${campaign.id}:${product.id}:${creative.id}`;
    if (cutoutAttempted.current === attemptKey) return;
    if (!layer) return;
    cutoutAttempted.current = attemptKey;
    void (async () => {
      const library = await getDatabase().assets.where('kind').equals('cutout').toArray().catch(() => [] as Asset[]);
      const existing = findCutoutAsset(library, product.id);
      if (existing) {
        studio.replaceProductLayer(existing);
        if (existing.meta?.provider) setCutoutMethod(existing.meta.provider);
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
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) { setBusy(false); setConsent(false); setSelected(null); setError(null); setCutoutMethod(null); setBgReview(null); } }); return () => { alive = false; }; }, [campaignId, concept?.id, provider.keyEpoch]);
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
    // The fetch below already aborts at 65s, but a promise that never
    // settles (or post-fetch work that hangs) would still leave the button
    // stuck on "Analyzing…". This watchdog guarantees recovery with a clear
    // timeout message even then; the run id keeps a stale timer from
    // cancelling a newer analysis.
    const runId = ++visionRunId.current;
    if (visionWatchdog.current) clearTimeout(visionWatchdog.current);
    visionWatchdog.current = setTimeout(() => {
      if (visionRunId.current === runId) { setVisionBusy(false); setError('timeout'); }
    }, 75000);
    try {
      const data = await blobToBase64(product.blob);
      const response = await metaFetch('vision', '/api/ai/vision-background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: visionModel.modelId, apiKey: visionKey, consent: true, imageConsent: true, language: workspace.locale, image: { mimeType: product.blob.type, data } }),
        signal: AbortSignal.timeout(65000), cache: 'no-store' });
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
   * check — a product, or a raised platform the product would stand on —
   * blocks the background and triggers one strict regeneration.
   */
  async function checkBackground(blob: Blob): Promise<CheckBackgroundResult | null> {
    if (!visionModel || !visionKey) return null;
    try {
      const data = await blobToBase64(blob);
      const response = await metaFetch('vision', '/api/ai/check-background', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: visionModel.modelId, apiKey: visionKey, consent: true, imageConsent: true, image: { mimeType: blob.type, data } }),
        signal: AbortSignal.timeout(65000), cache: 'no-store' });
      if (!response.ok) return null;
      return checkBackgroundSchema.parse(await response.json());
    } catch { return null; }
  }
  async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(blob);
    try { const image = new Image(); image.src = url; await image.decode(); return image; }
    finally { URL.revokeObjectURL(url); }
  }
  function drawToRgba(image: HTMLImageElement, width: number, height: number, dx = 0, dy = 0, dw = width, dh = height): RgbaImage {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, dx, dy, dw, dh);
    const data = ctx.getImageData(0, 0, width, height).data;
    return { width, height, data };
  }
  /**
   * Post-background review, run right after a background is applied. It
   * measures real pixels (not text-box fills): product vs surrounding
   * background, and each transparent-fill text layer vs the background
   * behind it. Three fixes apply automatically in one undoable update: the
   * product layer follows the vision scale rect, unreadable text moves
   * to the lightest brand color, and contact shadow grounds
   * the product on the new background. Any decode failure still shows the box
   * with an unavailable note instead of vanishing silently — generation
   * already succeeded, and the review must never block it.
   */
  async function reviewBackground(blob: Blob, fresh: Creative, scale: VisionBackgroundAnalysis['productScale'] | undefined, assets: Asset[], lightDirection?: VisionBackgroundAnalysis['lightDirection']) {
    if (!campaign) return;
    try {
      const dims = dimensionsFor(fresh.format);
      const bg = drawToRgba(await decodeImage(blob), dims.width, dims.height);
      const productLayer = fresh.layers.find(item => item.kind === 'product' && item.visible);
      const productAsset = productLayer?.assetId ? studio.assets.find(item => item.id === productLayer.assetId) : undefined;
      let productRatio: number | null = null;
      if (productLayer && productAsset) {
        const prod = drawToRgba(await decodeImage(productAsset.blob), dims.width, dims.height, productLayer.x, productLayer.y, productLayer.width, productLayer.height);
        productRatio = productBackgroundContrast(bg, prod, productLayer);
      }
      const textLow: { id: string; ratio: number }[] = [];
      for (const layer of fresh.layers) {
        if (!['headline', 'brand', 'cta'].includes(layer.kind) || !layer.visible || layer.fill !== 'transparent') continue;
        const ratio = textBackgroundContrast(bg, layer, layer.color);
        if (ratio !== null && ratio < TEXT_CONTRAST_MIN) textLow.push({ id: layer.id, ratio });
      }
      let next = fresh; let resized = false; let textFixed = false;
      if (scale && productLayer) {
        const target = SCALE_GEOMETRY[scale].productRect;
        const rect = { x: target.x / 1080 * dims.width, y: target.y / 1350 * dims.height, width: target.width / 1080 * dims.width, height: target.height / 1350 * dims.height };
        const same = Math.round(rect.x) === Math.round(productLayer.x) && Math.round(rect.y) === Math.round(productLayer.y) && Math.round(rect.width) === Math.round(productLayer.width) && Math.round(rect.height) === Math.round(productLayer.height);
        if (!same) {
          const resizedLayer = clampLayer(productLayer, rect, dims);
          next = { ...next, layers: next.layers.map(item => item.id === productLayer.id ? resizedLayer : item) };
          resized = true;
        }
      }
      if (textLow.length) {
        const lightest = lightestBrandColor(campaign.brandSnapshot.colors);
        next = { ...next, layers: next.layers.map(item => textLow.some(t => t.id === item.id) ? { ...item, color: lightest } : item) };
        textFixed = true;
      }
      // The enlarged product can invade a text box (the headline covering
      // the can in the blue-can export came from exactly this): slide any
      // text box off the product before saving, in the same undoable update.
      const guarded = resolveTextOverlap(next.layers, dims);
      const moved = guarded.some((item, index) => item.x !== next.layers[index].x || item.y !== next.layers[index].y);
      if (moved) next = { ...next, layers: guarded };
      // Integration polish is automatic, not another step: a fresh
      // background grounds the product with a contact shadow unless
      // the user already set it. Reflection is never enabled here: it
      // is always cleared, so older designs lose it too.
      const integrated = !fresh.polish?.shadow || !!fresh.polish?.reflection;
      if (integrated) next = { ...next, polish: { ...fresh.polish, shadow: true, reflection: false, grade: fresh.polish?.grade ?? null } };
      // The vision-measured light direction rides along with the polish so
      // the cast shadow can skew away from the scene's light later.
      const current = next.polish;
      const lightChanged = !!lightDirection && !!current && current.lightDirection !== lightDirection;
      if (lightChanged) next = { ...next, polish: { ...current, lightDirection } };
      if (resized || textFixed || integrated || lightChanged || moved) studio.update(next, assets);
      setBgReview({ productRatio, textLow, resized, textFixed, integrated });
    } catch { /* fail-open: the box still appears, saying the review could not run */ setBgReview({ productRatio: null, textLow: [], resized: false, textFixed: false, failed: true }); }
  }
  async function generate() {
    if (!creative || !campaign || !concept || !approved || !imageReady || !imageModel || !key || !consent || busy) return;
    const id = ++requestId.current; const controller = new AbortController(); abort.current = controller; setBusy(true); setError(null); setVisionNote(''); setBgReview(null);
    try {
      // The background model never sees product pixels, so the brief
      // carries the cutout's measured colors for harmony. Only the cutout
      // counts: the raw photo's backdrop would pollute the measurement.
      // Fail-open: colors are an enhancement, never a reason to block.
      let productColors: string[] | undefined;
      try {
        const productLayer = creative.layers.find(item => item.kind === 'product' && item.visible);
        const productAsset = productLayer?.assetId ? studio.assets.find(item => item.id === productLayer.assetId) : undefined;
        if (productAsset?.kind === 'cutout') {
          const image = await decodeImage(productAsset.blob);
          const rgba = drawToRgba(image, image.naturalWidth, image.naturalHeight);
          productColors = dominantColors(rgba.data, rgba.width, rgba.height, 3);
        }
      } catch { /* no colors: the brief still carries the brand palette */ }
      const brief = visionAnalysis ? buildVisionBrief(visionAnalysis, selectedScene, campaign.brandSnapshot.colors, productColors) : undefined;
      let blob: Blob | null = null;
      let blocked = false;
      let blockedByPlatform = false;
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
        if (check?.hasProduct || check?.hasPlatform) {
          // Vision path: one strict regeneration. Legacy path (no brief):
          // no stronger prompt exists, so block and let the user pick a scene.
          if (attempt === 0 && brief) continue;
          blocked = true;
          blockedByPlatform = !!check?.hasPlatform && !check?.hasProduct;
        } else {
          blob = candidate;
        }
      }
      if (blocked) { setVisionNote(blockedByPlatform ? s.visionPlatformFound : s.visionProductFound); return; }
      if (requestId.current === id && !controller.signal.aborted && blob) { const applied = studio.background(blob, 'meta', imageModel); setConsent(false); if (applied) void reviewBackground(blob, applied.creative, brief?.productScale, applied.assets, visionAnalysis?.lightDirection); }
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
        signal: AbortSignal.timeout(65000), cache: 'no-store' });
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
    setError(null); setBgReview(null); const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d')!;
    paintLocalBackground(ctx, campaign.brandSnapshot.colors);
    canvas.toBlob(blob => { if (blob) { const applied = studio.background(blob, 'local', null); if (applied) void reviewBackground(blob, applied.creative, undefined, applied.assets); } }, 'image/png');
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
    {activeIssue&&<IssueFix key={activeIssue.id} issue={activeIssue} creative={creative} handle={handle} onClose={()=>setActiveIssue(null)} brandColors={campaign.brandSnapshot.colors}/>}
    {!approved && <p className="campaign-notice">{s.stale}</p>}
    <div className="studio-tabs" role="tablist" aria-label={s.panels}>{(['layers', 'edit', 'generate', 'review', 'export'] as const).map(id => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{s.tabs[id]}</button>)}</div>
    <div className="studio-layout"><aside className={`studio-layers studio-panel ${tab === 'layers' ? 'active' : ''}`}><h2>{s.layersTitle}</h2><ul>{[...creative.layers].reverse().map(item => <li key={item.id}><button aria-pressed={layer?.id === item.id} onClick={() => { setSelected(item.id); setTab('edit'); }}>{s.kinds[item.kind]}</button></li>)}</ul><label htmlFor="creative-template">{s.template}</label><select id="creative-template" value={creative.appliedTemplate ?? ''} onChange={event => { const value = event.target.value as TemplateId; if (value) studio.update({ ...creative, appliedTemplate: value, layers: resolveTextOverlap(applyTemplate(creative.layers, value, dimensions), dimensions) }); }}><option value="">{s.templateChoose}</option>{TEMPLATE_IDS.map(id => <option key={id} value={id}>{s.templates[id]}</option>)}</select>{creative.appliedTemplate && <p>{s.templateCurrent.replace('{template}', s.templates[creative.appliedTemplate])}</p>}<p>{s.templateHelp}</p><p>{s.layerHelp}</p><div className="swap-product"><h3>{s.swapTitle}</h3><p>{s.swapHelp}</p><label>{s.swapUpload}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setSwapFile(event.target.files?.[0] ?? null)} /></label><button className="button secondary" disabled={!swapFile || swapBusy} onClick={() => void swapProduct()}>{swapBusy ? s.swapBusy : s.swapButton}</button>{swapNote && <p role="status">{swapNote}</p>}{recentCutouts.length > 0 && <><p>{s.swapRecent}</p><div>{recentCutouts.map((asset) => <button key={asset.id} className="text-button" onClick={() => { if (studio.replaceProductLayer(asset)) { setCutoutMethod(asset.meta?.provider ?? null); void refreshSwapContrast(asset.blob); } }}>{new Date(asset.createdAt).toLocaleString()}</button>)}</div></>}<button className="button secondary" disabled={!ready} onClick={() => void snapshotVariant()}>{s.swapSnapshot}</button><button className="button secondary" disabled={variants.length === 0} onClick={() => void downloadVariantsZip()}>{s.swapZip}</button></div></aside>
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
          {visionAnalysis && <fieldset className="vision-scenes"><legend>{visionAnalysis.productCategory} · {visionAnalysis.material} · {visionAnalysis.mood}</legend>
            {visionAnalysis.sceneIdeas.map((idea, index) => <label key={index} className={selectedScene === index ? 'scene-card selected' : 'scene-card'}><input type="radio" name="vision-scene" checked={selectedScene === index} onChange={() => setSelectedScene(index)} /><span><strong>{idea.scene}</strong> — {idea.setting}<br /><small>{idea.reason}</small></span></label>)}
          </fieldset>}
          {visionNote && <p role="status">{visionNote}</p>}</div>
          <label className="studio-consent"><input type="checkbox" checked={consent} disabled={busy || !approved || !imageReady || !key} onChange={event => setConsent(event.target.checked)}/><span>{m.common.consentShort}</span></label><details><summary>{m.common.consentDetails}</summary><p>{s.consent}</p></details><p>{s.billing}</p><button className="button primary" disabled={busy || !approved || !imageReady || !key || !consent} onClick={() => void generate()}>{busy ? s.generating : s.generate}</button>
          {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); requestId.current++; setBusy(false); setError('cancelled'); }}>{m.campaign.cancel}</button>}
          {bgReview && <div className="background-review" data-testid="background-review"><h3>{s.bgReviewTitle}</h3>
            {bgReview.failed && <p>{s.bgReviewFailed}</p>}
            {!bgReview.failed && (bgReview.productRatio === null && bgReview.textLow.length === 0 && !bgReview.resized && !bgReview.textFixed && !bgReview.integrated ? <p>{s.bgReviewOk}</p> : <>
              {bgReview.productRatio !== null && <p>{bgReview.productRatio >= PRODUCT_CONTRAST_MIN ? s.bgReviewProductOk.replace('{ratio}', bgReview.productRatio.toFixed(2)) : s.bgReviewProductLow.replace('{ratio}', bgReview.productRatio.toFixed(2))}</p>}
              {bgReview.textLow.length > 0 && <p>{s.bgReviewTextLow.replace('{ratio}', Math.min(...bgReview.textLow.map(t => t.ratio)).toFixed(2))}</p>}
              {bgReview.resized && <p>{s.bgReviewResized}</p>}
              {bgReview.textFixed && <p>{s.bgReviewTextFixed}</p>}
              {bgReview.integrated && <p>{s.bgReviewIntegrated}</p>}
              {bgReview.productRatio !== null && bgReview.productRatio < PRODUCT_CONTRAST_MIN && <button className="button secondary" onClick={() => { if (!creative || !campaign) return; const lightest = lightestBrandColor(campaign.brandSnapshot.colors); studio.update({ ...creative, polish: { ...creative.polish, shadow: creative.polish?.shadow ?? false, reflection: false, grade: lightest } }); }}>{s.bgReviewGrade}</button>}
            </>)}
          </div>}
          <div className="reference-block"><h3>{s.referenceTitle}</h3><p>{s.referenceHelp}</p>
          <button className="button secondary" disabled={referenceBusy || busy || !approved || !imageReady || !key || !consent || !product} onClick={() => void generateReference()}>{referenceBusy ? s.referenceGenerating : s.referenceGenerate}</button>
          {!consent && !referenceBusy && !busy && approved && imageReady && key !== '' && product && <p className="field-help">{s.referenceNeedsConsent}</p>}
          {referenceAsset && referenceUrl && <div className="reference-side">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referenceUrl} alt={s.referenceAlt} className="reference-image"/>
            <p>{s.referenceOnly}</p>
            <button className="button secondary" disabled={layoutBusy || !visionModel || !visionKey || !consent} onClick={() => void analyzeReferenceLayout()}>{layoutBusy ? s.referenceAnalyzing : s.referenceAnalyze}</button>
            <button className="text-button" onClick={() => { studio.update({ ...creative, referenceAssetId: null }); setReferenceLayout(null); }}>{s.referenceClear}</button>
            {referenceLayout && <div className="reference-layout"><p>{s.referenceZones.replace('{product}', s.referenceZoneNames[referenceLayout.productZone]).replace('{headline}', s.referenceZoneNames[referenceLayout.headlineZone]).replace('{cta}', s.referenceZoneNames[referenceLayout.ctaZone])}</p><p>{referenceLayout.notes}</p><p>{s.referenceTemplate.replace('{template}', s.templates[referenceLayout.suggestedTemplate])}</p><button className="button primary" onClick={() => studio.update({ ...creative, appliedTemplate: referenceLayout.suggestedTemplate, layers: resolveTextOverlap(applyTemplate(creative.layers, referenceLayout.suggestedTemplate, dimensions), dimensions) })}>{s.referenceApply}</button></div>}
          </div>}</div>
          <ProductMakeover/><div className="local-plan"><h3>{s.localTitle}</h3><p>{s.localHelp}</p><button className="button secondary" disabled={busy} onClick={localBackground}>{s.localButton}</button></div>
        </section><section className={`studio-panel ${tab === 'export' ? 'active' : ''}`} data-panel="export"><h2>{s.exportTitle}</h2><p>{s.exportHelp}</p><button className="button primary" disabled={!ready} onClick={download}>{s.download} ↗</button><label htmlFor="creative-caption">{m.campaign.fields.caption}</label><textarea id="creative-caption" disabled={busy} rows={5} maxLength={1200} value={creative.caption} dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'} onChange={event => studio.update({ ...creative, caption: event.target.value })}/><p>{s.reviewLater}</p></section>
        <CriticPanel onFix={setActiveIssue} key={creative.id} creative={creative} creativeLanguage={campaign.creativeLanguage} assets={studio.assets} handleRef={handle} ready={ready} fontsReady={fontsReady} active={tab === 'review'} selectLayer={id => { setSelected(id); setTab('edit'); }} brandColors={campaign.brandSnapshot.colors}/>
      </div></div>{error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
  </section>;
}
