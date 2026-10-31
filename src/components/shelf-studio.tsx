'use client';
import { prepareImageUpload } from '@/lib/media/prepare-image';
import { imageFileName } from '@/lib/image-name';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { useObjectUrl } from './logo';
import { WaitingText } from './waiting';
import { GeneratingCanvas } from './generating-canvas';
import { Button, ButtonLink, ModelBadge, ScoreRing } from './ui';
import { IconCheck, IconSparkles } from './ui/icons';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { ProviderError } from '@/lib/ai/errors';
import { encodeProduct, fitProductImage, validateGeneratedImage } from '@/lib/campaign/client';
import { cutoutImage } from '@/lib/cutout/provider';
import { oneshotScore, verifyResultSchema, type VerifyResult } from '@/lib/ai/oneshot';
import { repairNotes, REPAIR_THRESHOLD } from '@/lib/agent/pipeline';
import { PLAN_DIALECTS, dialectLanguage, type PlanDialect } from '@/lib/campaign/dialects';
import { cleanDetections, shelfDetectionSchema, shelfPlanSchema, type ShelfBox } from '@/lib/shelf/schema';
import { scanVideo, sharpestFrame, type ScannedFrame } from '@/lib/shelf/frames';
import { cropToProduct } from '@/lib/shelf/crop';
import { shelfLayout, drawShelfMockup } from '@/lib/shelf/mockup';
import { withRateLimit } from '@/lib/shelf/queue';
import { saveAd } from '@/lib/db/repository';
import { writeZip } from '@/lib/export/zip';
import type { BrandInput } from '@/lib/db/schema';

type Stage = 'capture' | 'video' | 'detecting' | 'cutting' | 'review' | 'generating' | 'done';
type CutState = 'waiting' | 'cutting' | 'cut' | 'failed';
type AdState = 'waiting' | 'painting' | 'reviewing' | 'repairing' | 'done' | 'failed';
type Item = {
  id: string; name: string; category: string; priceText: string; box: ShelfBox;
  cut: CutState; cutout?: Blob; aspect?: number; include: boolean; error?: string; from?: DOMRect | null;
};
type Ad = { state: AdState; headline: string; cta: string; caption: string; scene: string; blob?: Blob; score?: number; certificate?: VerifyResult | null; error?: string };

const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function TrayCard({ item, index, onChange, disabled, labels }: { item: Item; index: number; onChange: (patch: Partial<Item>) => void; disabled: boolean; labels: { name: string; price: string; include: string; cutting: string; failed: string; retry: string } & { onRetry: () => void } }) {
  const url = useObjectUrl(item.cutout ?? null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const flown = useRef(false);
  // FLIP: the cutout flies from its box on the shelf photo into its card.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !url || flown.current || !item.from || reduceMotion()) return;
    flown.current = true;
    const last = img.getBoundingClientRect();
    if (!last.width || !last.height) return;
    const dx = item.from.left - last.left, dy = item.from.top - last.top;
    const sx = item.from.width / last.width, sy = item.from.height / last.height;
    img.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, filter: 'drop-shadow(0 0 12px var(--model-sam))' },
      { transform: 'none', filter: 'drop-shadow(0 0 0 transparent)' },
    ], { duration: 820, easing: 'cubic-bezier(.22,1,.36,1)', delay: 650 });
  }, [url, item.from]);
  return <article className={`shelf-card is-${item.cut}${item.include ? '' : ' is-off'}`} data-testid="shelf-card" style={{ '--i': index } as CSSProperties}>
    <div className="shelf-card-media">
      <span className="shelf-card-index">{index + 1}</span>
      {url ? <img ref={imgRef} src={url} alt={item.name} /> : item.cut === 'failed' ? <span className="shelf-card-state">{labels.failed}</span> : <span className="shelf-card-state"><WaitingText label={labels.cutting} /></span>}
    </div>
    <label className="shelf-field"><span>{labels.name}</span><input value={item.name} maxLength={60} disabled={disabled} onChange={event => onChange({ name: event.target.value })} /></label>
    <label className="shelf-field"><span>{labels.price}</span><input value={item.priceText} maxLength={24} dir="auto" disabled={disabled} onChange={event => onChange({ priceText: event.target.value })} /></label>
    {item.cut === 'failed'
      ? <Button size="sm" onClick={labels.onRetry} disabled={disabled}>{labels.retry}</Button>
      : <button type="button" role="switch" aria-checked={item.include} className="shelf-include" disabled={disabled || item.cut !== 'cut'} onClick={() => onChange({ include: !item.include })}><i aria-hidden="true" />{labels.include}</button>}
    {item.error && <p className="shelf-card-error">{item.error}</p>}
  </article>;
}

function AdCard({ item, ad, index, labels, onRetry, colors }: { item: Item; ad: Ad; index: number; colors: readonly string[]; labels: Record<'painting' | 'reviewing' | 'repairing' | 'waiting' | 'failed' | 'retry' | 'download' | 'share' | 'score' | 'copy' | 'paint' | 'review', string>; onRetry: () => void }) {
  const url = useObjectUrl(ad.blob ?? null);
  const thumb = useObjectUrl(item.cutout ?? null);
  const busy = ad.state === 'painting' || ad.state === 'reviewing' || ad.state === 'repairing';
  const steps: { key: string; label: string; model: 'spark' | 'image'; done: boolean; active: boolean }[] = [
    { key: 'copy', label: labels.copy, model: 'spark', done: true, active: false },
    { key: 'paint', label: labels.paint, model: 'image', done: ['reviewing', 'repairing', 'done'].includes(ad.state), active: ad.state === 'painting' || ad.state === 'repairing' },
    { key: 'review', label: labels.review, model: 'spark', done: ad.state === 'done', active: ad.state === 'reviewing' },
  ];
  async function share() {
    if (!ad.blob) return;
    const file = new File([ad.blob], imageFileName(item.name || 'ad', ad.blob), { type: ad.blob.type || 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: ad.caption }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${ad.headline}\n${ad.caption}`)}`, '_blank', 'noopener');
  }
  return <article className={`shelf-ad is-${ad.state}`} data-testid="shelf-ad" style={{ '--i': index } as CSSProperties}>
    <header>{thumb && <img src={thumb} alt="" />}<strong>{item.name}</strong>{ad.score !== undefined && <span className={`shelf-score ${ad.score >= REPAIR_THRESHOLD ? 'ok' : 'warn'}`}>{labels.score} {ad.score}</span>}</header>
    <div className={busy || ad.state === 'waiting' ? 'shelf-ad-frame is-busy' : 'shelf-ad-frame'}>
      {url ? <img className="oneshot-reveal" key={url} src={url} alt={ad.headline} data-testid="shelf-ad-image" />
        : <div className="shelf-ad-placeholder">{thumb && <img src={thumb} alt="" />}<p dir="auto">{ad.headline}</p></div>}
      {busy && <GeneratingCanvas colors={colors} hint={url ?? thumb}><WaitingText label={labels[ad.state as 'painting' | 'reviewing' | 'repairing']} /></GeneratingCanvas>}
    </div>
    <ol className="shelf-ad-steps" aria-label={item.name}>
      {steps.map(step => <li key={step.key} className={step.done ? 'done' : step.active ? 'active' : ''}><span className="model-dot" data-model={step.model} aria-hidden="true" />{step.label}{step.done && <IconCheck size={12} />}</li>)}
    </ol>
    {ad.state === 'done' && <p className="shelf-ad-caption" dir="auto">{ad.caption}</p>}
    {ad.state === 'failed' && <><p className="shelf-card-error" role="alert">{ad.error}</p><Button size="sm" onClick={onRetry}>{labels.retry}</Button></>}
    {ad.state === 'done' && url && <div className="shelf-ad-actions">
      <a className="ui-btn ui-btn--secondary ui-btn--sm" href={url} download={imageFileName(item.name || 'ad', ad.blob)}>{labels.download}</a>
      <Button size="sm" variant="ghost" onClick={() => void share()}>{labels.share}</Button>
    </div>}
  </article>;
}

/**
 * Shoot the shelf, get a campaign. One photo (or the sharpest frame of a
 * short video) → Muse Spark finds every product → SAM 3.1 cuts each one
 * out live on the photo → Muse Spark plans one ad per product in the
 * chosen dialect → Muse Image paints each ad and Muse Spark reviews it,
 * with one repair when the review is weak.
 */
export default function ShelfStudio() {
  const m = useMessages(), t = m.shelf, o = m.oneshot, workspace = useWorkspace(), provider = useProviderSession();
  const key = provider.configs.meta.apiKey.trim();
  const spark = provider.taskModel('vision'), planner = provider.taskModel('planner'), sam = provider.taskModel('segment'), painter = provider.taskModel('image_edit') ?? provider.taskModel('image');
  const errorText = { errors: m.settings.errors, aiError: m.meta.aiError };

  const [stage, setStage] = useState<Stage>('capture');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [frames, setFrames] = useState<ScannedFrame[]>([]);
  const [bestFrame, setBestFrame] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [ads, setAds] = useState<Record<string, Ad>>({});
  const [campaignName, setCampaignName] = useState('');
  const [error, setError] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [brand, setBrand] = useState<BrandInput>({ name: '', description: '', colors: ['#7C5CFF', '#F5EEDF', '#16100C'] });
  const [pickedDialect, setDialect] = useState<PlanDialect | null>(null);
  const dialect: PlanDialect = pickedDialect ?? (workspace.locale === 'ar' ? 'ar_eg' : 'en');
  const [zipping, setZipping] = useState(false);
  const photoUrl = useObjectUrl(photo);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const brandValid = brand.name.trim().length > 0 && brand.description.trim().length > 0;
  const chosen = items.filter(item => item.include && item.cut === 'cut');
  const readyAds = chosen.filter(item => ads[item.id]?.state === 'done').length;
  const requestsEstimate = 1 + chosen.length * 2;
  const step = stage === 'capture' || stage === 'video' ? 0 : stage === 'detecting' ? 1 : stage === 'cutting' || stage === 'review' ? 2 : 3;
  const onWait = (seconds: number) => setWaitSeconds(seconds);

  function reset() {
    setStage('capture'); setPhoto(null); setFrames([]); setBestFrame(null); setItems([]); setAds({}); setCampaignName(''); setError('');
  }

  async function pickPhoto(file: File) {
    setError('');
    let prepared: File;
    try { prepared = await prepareImageUpload(file); } catch (cause) { setError(metaErrorMessage(cause, errorText)); return; }
    const fitted = await fitProductImage(prepared);
    setFrames([]); setBestFrame(null);
    setPhoto(fitted); void detect(fitted);
  }

  async function trySample() {
    setError('');
    try { const blob = await (await fetch('/demo/shelf-sample.jpg')).blob(); setFrames([]); setBestFrame(null); setPhoto(blob); void detect(blob); }
    catch { setError(t.videoError); }
  }

  async function pickVideo(file: File) {
    setError(''); setStage('video'); setFrames([]); setBestFrame(null); setPhoto(null);
    try {
      const scanned = await scanVideo(file, 8, frame => setFrames(previous => [...previous, frame]));
      const best = sharpestFrame(scanned);
      if (!best) throw new Error('video_decode');
      setBestFrame(scanned.indexOf(best));
    } catch { setError(t.videoError); setStage('capture'); }
  }

  async function chooseFrame(index: number) {
    const frame = frames.at(index); if (!frame) return;
    const fitted = await fitProductImage(frame.blob);
    setBestFrame(index); setPhoto(fitted); void detect(fitted);
  }

  async function detect(image: Blob) {
    if (!spark || !key) { setError(t.needKey); setStage('capture'); return; }
    setStage('detecting'); setItems([]); setAds({}); setError('');
    try {
      const body = { providerId: 'meta', modelId: spark.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(image), language: workspace.locale === 'ar' ? 'ar' : 'en' };
      const result = await withRateLimit(async () => {
        const response = await metaFetch('vision', '/api/ai/shelf-detect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(response);
        return shelfDetectionSchema.parse(await response.json());
      }, onWait);
      const found = cleanDetections(result.products);
      if (found.length === 0) { setError(t.noneFound); setStage('capture'); return; }
      const next: Item[] = found.map((product, index) => ({ id: `p${index + 1}`, name: product.name, category: product.category, priceText: product.priceText, box: product.box, cut: 'waiting', include: true }));
      setItems(next);
      setStage('cutting');
      // Let the boxes draw in before the first cut starts.
      await new Promise(resolve => setTimeout(resolve, reduceMotion() ? 0 : 600 + next.length * 120));
      for (const item of next) await cut(image, item);
      setStage('review');
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); setStage(items.length ? 'review' : 'capture'); }
  }

  function boxRect(box: ShelfBox): DOMRect | null {
    const host = stageRef.current?.querySelector('img');
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    return new DOMRect(rect.left + box.left * rect.width, rect.top + box.top * rect.height, (box.right - box.left) * rect.width, (box.bottom - box.top) * rect.height);
  }

  async function cut(image: Blob, item: Item) {
    if (!sam || !key) return;
    setItems(previous => previous.map(entry => entry.id === item.id ? { ...entry, cut: 'cutting', error: undefined } : entry));
    try {
      const result = await withRateLimit(() => cutoutImage(image, 'meta-sam', { apiKey: key, modelId: sam.modelId, box: item.box, signal: AbortSignal.timeout(65000) }), onWait);
      const cropped = await cropToProduct(result.cutoutBlob);
      const bitmap = await createImageBitmap(cropped); const aspect = bitmap.width / bitmap.height; bitmap.close();
      const from = boxRect(item.box);
      setItems(previous => previous.map(entry => entry.id === item.id ? { ...entry, cut: 'cut', cutout: cropped, aspect, from } : entry));
    } catch (cause) {
      setItems(previous => previous.map(entry => entry.id === item.id ? { ...entry, cut: 'failed', include: false, error: metaErrorMessage(cause, errorText) } : entry));
    }
  }

  function applySavedBrand(id: string) {
    setSelectedBrandId(id);
    const saved = workspace.brands.find(entry => entry.id === id);
    if (saved) setBrand({ name: saved.name, description: saved.description, colors: saved.colors });
  }

  async function paintOne(item: Item, ad: Ad): Promise<Ad> {
    if (!painter || !item.cutout) throw new ProviderError('invalid_model', 400);
    const language = dialectLanguage(dialect);
    const layout = shelfLayout({ headline: ad.headline, cta: ad.cta, priceText: item.priceText, productAspect: item.aspect ?? 1, rtl: language === 'ar' });
    await document.fonts.load('800 72px Cairo').catch(() => {}); await document.fonts.load('800 72px Inter').catch(() => {});
    const accent = isHex(brand.colors[0]) ? brand.colors[0] : '#7C5CFF';
    const mockup = await encodeProduct(await fitProductImage(await drawShelfMockup(item.cutout, layout, accent)));
    const sanitized: BrandInput = { ...brand, colors: brand.colors.map(color => isHex(color) ? color : '#16100C') as [string, string, string] };
    const attempt = async (fixNotes?: string[]) => {
      setAds(previous => ({ ...previous, [item.id]: { ...previous[item.id], state: fixNotes ? 'repairing' : 'painting' } }));
      const blob = await withRateLimit(async () => {
        const response = await metaFetch('image_edit', '/api/ai/oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: painter.modelId, apiKey: key, consent: true, imageConsent: true, mockup, brand: sanitized, scene: ad.scene, language, layout, ...(fixNotes ? { fixNotes } : {}) }), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(response);
        const image = await response.blob(); await validateGeneratedImage(image); return image;
      }, onWait);
      if (!spark) return { blob, certificate: null, score: undefined };
      setAds(previous => ({ ...previous, [item.id]: { ...previous[item.id], state: 'reviewing' } }));
      const fitted = await encodeProduct(await fitProductImage(blob));
      const certificate = await withRateLimit(async () => {
        const response = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: spark.modelId, apiKey: key, consent: true, imageConsent: true, image: fitted, layout, language }), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(response);
        return verifyResultSchema.parse(await response.json());
      }, onWait);
      return { blob, certificate, score: oneshotScore(certificate, false) };
    };
    let best = await attempt();
    if (best.certificate && best.score !== undefined && best.score < REPAIR_THRESHOLD) {
      const notes = repairNotes(best.certificate, false);
      if (notes.length) { const second = await attempt(notes); if ((second.score ?? -1) > (best.score ?? -1)) best = second; }
    }
    void saveAd({ id: crypto.randomUUID(), blob: best.blob, source: 'shelf', brand: sanitized, headline: ad.headline, hasLogo: false, createdAt: new Date().toISOString(), scene: ad.scene, format: '1080x1350', cutout: item.cutout }).catch(() => {});
    if (navigator.vibrate) navigator.vibrate(20);
    return { ...ad, state: 'done', blob: best.blob, certificate: best.certificate, score: best.score };
  }

  async function makeCampaign() {
    if (!planner || !painter || !key || !brandValid || chosen.length === 0) return;
    setStage('generating'); setError('');
    const waiting: Record<string, Ad> = {};
    for (const item of chosen) waiting[item.id] = { state: 'waiting', headline: item.name, cta: '', caption: '', scene: '' };
    setAds(waiting);
    try {
      const body = { providerId: 'meta', modelId: planner.modelId, apiKey: key, consent: true, brand, dialect, products: chosen.map(item => ({ id: item.id, name: item.name.trim() || item.category, category: item.category, priceText: item.priceText.trim() })) };
      const plan = await withRateLimit(async () => {
        const response = await metaFetch('planner', '/api/ai/shelf-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(response);
        return shelfPlanSchema.parse(await response.json());
      }, onWait);
      setCampaignName(plan.campaignName);
      const planned: Record<string, Ad> = {};
      for (const item of chosen) {
        const entry = plan.products.find(product => product.id === item.id);
        planned[item.id] = { state: 'waiting', headline: entry?.headline ?? item.name, cta: entry?.cta ?? t.ctaFallback, caption: entry?.caption ?? '', scene: entry?.scene ?? t.sceneFallback };
      }
      setAds(planned);
      for (const item of chosen) await runAd(item, planned[item.id]);
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setWaitSeconds(0); setStage('done'); }
  }

  async function runAd(item: Item, ad: Ad) {
    try { const done = await paintOne(item, ad); setAds(previous => ({ ...previous, [item.id]: done })); }
    catch (cause) { setAds(previous => ({ ...previous, [item.id]: { ...previous[item.id], state: 'failed', error: metaErrorMessage(cause, errorText) } })); }
  }

  async function downloadCampaign() {
    setZipping(true);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      const summary: Record<string, unknown>[] = [];
      for (const [index, item] of chosen.entries()) {
        const ad = ads[item.id];
        if (!ad?.blob) continue;
        const slug = `${String(index + 1).padStart(2, '0')}-${item.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 30) || 'product'}`;
        files.push({ name: imageFileName(slug, ad.blob), data: new Uint8Array(await ad.blob.arrayBuffer()) });
        files.push({ name: `${slug}.txt`, data: new TextEncoder().encode(`${ad.headline}\n${ad.cta}\n\n${ad.caption}\n`) });
        summary.push({ product: item.name, price: item.priceText, headline: ad.headline, cta: ad.cta, score: ad.score ?? null, extraText: ad.certificate?.extraText ?? [] });
      }
      files.push({ name: 'campaign.json', data: new TextEncoder().encode(JSON.stringify({ campaign: campaignName, dialect, models: { detect: spark?.modelId, cut: sam?.modelId, plan: planner?.modelId, paint: painter?.modelId, review: spark?.modelId }, ads: summary }, null, 2)) });
      const zip = writeZip(files);
      const url = URL.createObjectURL(new Blob([zip.slice()], { type: 'application/zip' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'admorph-shelf-campaign.zip'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setZipping(false); }
  }

  // Leaving mid-run would orphan requests; warn once while busy.
  useEffect(() => {
    if (stage !== 'generating' && stage !== 'detecting' && stage !== 'cutting') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage]);

  const cutCount = items.filter(item => item.cut === 'cut').length;
  const activeCut = items.find(item => item.cut === 'cutting');
  const stages = [t.stageCapture, t.stageScan, t.stageCut, t.stageCampaign];
  const adLabels = { painting: t.painting, reviewing: t.reviewing, repairing: t.repairing, waiting: t.waiting, failed: t.failed, retry: t.retry, download: t.download, share: t.share, score: t.score, copy: t.stepCopy, paint: t.stepPaint, review: t.stepReview };
  const busy = stage === 'detecting' || stage === 'cutting' || stage === 'generating';
  const dialectChips = useMemo(() => PLAN_DIALECTS, []);

  return <main className="shelf">
    <header className="shelf-hero">
      <span className="home-eyebrow"><span className="dot" />{t.eyebrow}</span>
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <div className="shelf-models"><ModelBadge model="spark" chip detail={t.roleSpark} /><ModelBadge model="sam" chip detail={t.roleSam} /><ModelBadge model="image" chip detail={t.roleImage} /></div>
      <ol className="shelf-rail" aria-label={t.progressLabel}>
        {stages.map((label, index) => <li key={label} className={index < step ? 'done' : index === step ? 'current' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <IconCheck size={13} /> : index + 1}</span>{label}</li>)}
      </ol>
    </header>

    {!key && <p className="shelf-note">{t.needKey} <Link href="/settings">{m.nav.settings}</Link></p>}
    {waitSeconds > 0 && <p className="shelf-note shelf-wait" role="status" data-testid="shelf-wait">{t.rateWait.replace('{s}', String(waitSeconds))}</p>}
    {error && <p className="shelf-error" role="alert">{error}</p>}

    {stage === 'capture' && <section className="shelf-capture" data-testid="shelf-capture">
      <label className="shelf-drop">
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t.photoInput} disabled={!key} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void pickPhoto(file); }} />
        <span className="shelf-drop-art" aria-hidden="true"><svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="12" width="36" height="28" rx="5" /><circle cx="24" cy="26" r="7" /><path d="M17 12l3-5h8l3 5" /></svg></span>
        <strong>{t.photoTitle}</strong><small>{t.photoHint}</small>
      </label>
      <label className="shelf-drop">
        <input type="file" accept="video/mp4,video/webm,video/quicktime" aria-label={t.videoInput} disabled={!key} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void pickVideo(file); }} />
        <span className="shelf-drop-art" aria-hidden="true"><svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="12" width="28" height="24" rx="5" /><path d="M33 21l10-6v18l-10-6z" /></svg></span>
        <strong>{t.videoTitle}</strong><small>{t.videoHint}</small>
      </label>
      <div className="shelf-sample">
        <img src="/demo/shelf-sample.jpg" alt="" />
        <div><strong>{t.sampleTitle}</strong><small>{t.sampleHint}</small></div>
        <Button disabled={!key} onClick={() => void trySample()}>{t.sampleCta}</Button>
      </div>
      <ul className="shelf-tips"><li>{t.tip1}</li><li>{t.tip2}</li><li>{t.tip3}</li></ul>
    </section>}

    {stage === 'video' && <section className="shelf-frames" data-testid="shelf-frames" aria-live="polite">
      <h2>{bestFrame === null ? <WaitingText label={t.scanningFrames} /> : t.sharpestFound}</h2>
      <div className="shelf-strip">
        {frames.map((frame, index) => {
          const max = Math.max(...frames.map(item => item.sharpness), 1);
          return <button type="button" key={index} className={index === bestFrame ? 'shelf-frame best' : 'shelf-frame'} style={{ '--i': index } as CSSProperties} disabled={bestFrame === null} onClick={() => void chooseFrame(index)} aria-label={`${t.frame} ${index + 1}`}>
            <img src={frame.thumb} alt="" />
            <span className="shelf-meter"><i style={{ transform: `scaleX(${Math.max(0.06, frame.sharpness / max)})` }} /></span>
            <small>{frame.time.toFixed(1)}s</small>
          </button>;
        })}
      </div>
      {bestFrame !== null && <Button variant="primary" size="lg" icon={<IconSparkles size={18} />} onClick={() => void chooseFrame(bestFrame)}>{t.useSharpest}</Button>}
    </section>}

    {photoUrl && stage !== 'capture' && stage !== 'video' && <section className="shelf-workbench">
      <div ref={stageRef} className={`shelf-stage is-${stage}${activeCut ? ' is-cutting-one' : ''}`} data-testid="shelf-stage">
        <img src={photoUrl} alt={t.photoAlt} />
        {stage === 'detecting' && <><span className="shelf-beam" aria-hidden="true" /><span className="shelf-grid" aria-hidden="true" /><p className="shelf-stage-status" role="status"><WaitingText label={t.detecting} /></p></>}
        {items.map((item, index) => <div key={item.id} className={`shelf-box is-${item.cut}${item.box.right > 0.75 ? ' is-end' : ''}`} data-testid="shelf-box" style={{ left: `${item.box.left * 100}%`, top: `${item.box.top * 100}%`, width: `${(item.box.right - item.box.left) * 100}%`, height: `${(item.box.bottom - item.box.top) * 100}%`, '--i': index } as CSSProperties}>
          <span className="shelf-box-label"><b>{index + 1}</b><span className="shelf-box-text">{item.name}{item.priceText && <em>{item.priceText}</em>}</span></span>
          {item.cut === 'cut' && item.cutout && <CutGlow blob={item.cutout} />}
        </div>)}
        {stage === 'cutting' && <p className="shelf-stage-status" role="status"><WaitingText label={t.cutting.replace('{n}', String(Math.min(cutCount + 1, items.length))).replace('{total}', String(items.length))} /></p>}
      </div>

      {items.length > 0 && <div className="shelf-tray" data-testid="shelf-tray">
        <div className="shelf-tray-head"><h2>{t.trayTitle.replace('{n}', String(items.length))}</h2><span>{t.traySub}</span></div>
        <div className="shelf-tray-grid">
          {items.map((item, index) => <TrayCard key={item.id} item={item} index={index} disabled={busy}
            onChange={patch => setItems(previous => previous.map(entry => entry.id === item.id ? { ...entry, ...patch } : entry))}
            labels={{ name: t.name, price: t.price, include: t.include, cutting: t.cuttingOne, failed: t.cutFailed, retry: t.retry, onRetry: () => { if (photo) void cut(photo, item); } }} />)}
        </div>
      </div>}
    </section>}

    {stage === 'review' && <section className="shelf-brief" data-testid="shelf-brief">
      <h2>{t.briefTitle}</h2>
      <fieldset className="brand-pick-fieldset"><legend>{t.brandLabel}</legend><div className="brand-pick-grid">
        <button type="button" className={selectedBrandId === '' ? 'brand-pick selected' : 'brand-pick'} aria-pressed={selectedBrandId === ''} onClick={() => setSelectedBrandId('')}>{o.brandCustom}</button>
        {workspace.brands.map(entry => <button type="button" key={entry.id} className={selectedBrandId === entry.id ? 'brand-pick selected' : 'brand-pick'} aria-pressed={selectedBrandId === entry.id} onClick={() => applySavedBrand(entry.id)}><span className="brand-pick-name">{entry.name}</span><span className="brand-pick-swatches">{entry.colors.map(color => <i key={color} style={{ background: color }} />)}</span></button>)}
      </div></fieldset>
      {selectedBrandId === '' && <div className="shelf-brand-fields">
        <label className="shelf-field"><span>{t.shopName}</span><input value={brand.name} maxLength={80} onChange={event => setBrand(previous => ({ ...previous, name: event.target.value }))} /></label>
        <label className="shelf-field"><span>{t.shopAbout}</span><input value={brand.description} maxLength={300} onChange={event => setBrand(previous => ({ ...previous, description: event.target.value }))} /></label>
        <label className="shelf-field shelf-color"><span>{t.shopColor}</span><input type="color" value={isHex(brand.colors[0]) ? brand.colors[0] : '#7C5CFF'} onChange={event => setBrand(previous => ({ ...previous, colors: [event.target.value, previous.colors[1], previous.colors[2]] }))} /></label>
      </div>}
      <fieldset className="dialect-pick"><legend>{o.dialectLabel}</legend>
        <div className="dialect-grid" role="radiogroup" aria-label={o.dialectLabel}>
          {dialectChips.map(value => <button key={value} type="button" role="radio" aria-checked={dialect === value} className={dialect === value ? 'dialect-chip selected' : 'dialect-chip'} onClick={() => setDialect(value)}>{o[`dialect_${value}`]}</button>)}
        </div>
      </fieldset>
      <div className="shelf-go">
        <p>{t.cost.replace('{ads}', String(chosen.length)).replace('{n}', String(requestsEstimate))}</p>
        {!brandValid && <p className="wizard-reason">{t.needBrand}</p>}
        <Button variant="primary" size="lg" icon={<IconSparkles size={18} />} disabled={!brandValid || chosen.length === 0 || !key} onClick={() => void makeCampaign()}>{t.make.replace('{n}', String(chosen.length))}</Button>
        <Button variant="ghost" onClick={reset}>{t.startOver}</Button>
      </div>
    </section>}

    {(stage === 'generating' || stage === 'done') && <section className="shelf-campaign" data-testid="shelf-campaign">
      <div className="shelf-campaign-head">
        <div>
          <span className="shelf-campaign-kicker">{t.campaign}</span>
          <h2 data-testid="shelf-campaign-name">{campaignName || <WaitingText label={t.planning} />}</h2>
          <p>{t.progress.replace('{done}', String(readyAds)).replace('{total}', String(chosen.length))}</p>
        </div>
        <ScoreRing value={chosen.length ? Math.round((readyAds / chosen.length) * 100) : 0} size={88} stroke={8} label={t.progressLabel} />
      </div>
      <div className="shelf-ads">
        {chosen.map((item, index) => ads[item.id] && <AdCard key={item.id} item={item} ad={ads[item.id]} index={index} labels={adLabels} colors={brand.colors} onRetry={() => void runAd(item, ads[item.id])} />)}
      </div>
      {stage === 'done' && <div className="shelf-done">
        <Button variant="primary" size="lg" loading={zipping} disabled={readyAds === 0} onClick={() => void downloadCampaign()}>{t.downloadAll}</Button>
        <ButtonLink href="/gallery">{t.openGallery}</ButtonLink>
        <Button variant="ghost" onClick={reset}>{t.newShelf}</Button>
      </div>}
    </section>}
  </main>;
}

/** The cut product, drawn exactly over its box with SAM's cyan edge glow. */
function CutGlow({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? <img className="shelf-cut-glow" src={url} alt="" aria-hidden="true" /> : null;
}

