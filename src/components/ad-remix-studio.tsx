'use client';
import { imageFileName } from '@/lib/image-name';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { encodeProduct, fitProductImage, validateGeneratedImage, requestPlan } from '@/lib/campaign/client';
import { oneshotScore, verifyResultSchema, type OneshotElement, type VerifyResult } from '@/lib/ai/oneshot';
import { REMIX_THEMES, MIN_SEASON_CUES, SEASON_FALLBACK_HEADLINE, seasonFallbackScene, NEUTRAL_VARIANT_SCENES, FALLBACK_CODES, type RemixThemeId } from '@/lib/ai/remix';
import { ProviderError } from '@/lib/ai/errors';
import { VARIANT_AXES, artBriefToScene, settingOf, type VariantAxis } from '@/lib/ai/art-brief';
import { loadSavedAds, saveAd, deleteSavedAd, loadRecentScenes } from '@/lib/db/repository';
import type { SavedAd, BrandInput } from '@/lib/db/schema';
import { useObjectUrl } from './logo';
import { WaitingText } from './waiting';
import { GeneratingCanvas } from './generating-canvas';
import { useDemoDriver } from './demo-tour';
import { pickLooks } from '@/lib/ai/looks';
import { withRateLimit } from '@/lib/shelf/queue';

type RemixResult = { id: string; blob: Blob; headline: string; score: number | null; certificate: VerifyResult | null; axis?: VariantAxis };

/** One thumbnail in the picker strip. The first button selects it (tests and keyboard users rely on that). */
function SavedAdCard({ ad, selected, onSelect, disabled }: { ad: SavedAd; selected: boolean; onSelect: () => void; disabled: boolean }) {
  const url = useObjectUrl(ad.blob);
  return <article className="remix-source-card" data-testid="remix-source-card" data-selected={selected || undefined}>
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect} aria-label={`${ad.headline || ad.brand.name} · ${ad.createdAt.slice(0, 10)}`}>
      {url && <img src={url} alt="" loading="lazy" />}
    </button>
  </article>;
}

/** The big preview of the picked ad, with its details and the delete action. */
function SelectedPreview({ ad, labels, onDelete, armed, disabled, onStep, canStep }: { ad: SavedAd; labels: { delete: string; confirmDelete: string; prev: string; next: string; selected: string }; onDelete: () => void; armed: boolean; disabled: boolean; onStep: (delta: number) => void; canStep: boolean }) {
  const url = useObjectUrl(ad.blob);
  return <div className="remix-hero" data-testid="remix-selected">
    <div className="remix-hero-media">
      {url && <img key={url} className="media-reveal" src={url} alt={ad.headline || ad.brand.name} />}
      {canStep && <>
        <button type="button" className="remix-hero-step is-prev" aria-label={labels.prev} disabled={disabled} onClick={() => onStep(-1)}>‹</button>
        <button type="button" className="remix-hero-step is-next" aria-label={labels.next} disabled={disabled} onClick={() => onStep(1)}>›</button>
      </>}
    </div>
    <div className="remix-hero-info">
      <span className="remix-hero-tag">{labels.selected}</span>
      <strong dir="auto">{ad.headline || ad.brand.name}</strong>
      <span className="remix-hero-meta"><span className="remix-swatches" aria-hidden="true">{ad.brand.colors.map((color, index) => <i key={`${color}-${index}`} style={{ background: color }} />)}</span>{ad.brand.name} · {ad.createdAt.slice(0, 10)}</span>
      <button type="button" className="button secondary danger remix-hero-delete" disabled={disabled} onClick={onDelete}>{armed ? labels.confirmDelete : labels.delete}</button>
    </div>
  </div>;
}

function ResultCard({ result, downloadLabel, scoreLabel, notesLabel, axisLabel, index }: { result: RemixResult; downloadLabel: string; scoreLabel: string; notesLabel: string; axisLabel?: string; index: number }) {
  const url = useObjectUrl(result.blob);
  const notes = result.certificate ? [result.certificate.productNote, result.certificate.logoNote, result.certificate.layoutNote].filter(Boolean) : [];
  return <article className="remix-box is-done" data-testid="remix-result" style={{ '--i': index } as CSSProperties}>
    <div className="remix-box-media">
      {url && <img className="media-reveal" src={url} alt={result.headline} />}
      {axisLabel && <span className="remix-axis" data-testid="remix-axis">{axisLabel}</span>}
    </div>
    <div className="remix-box-body">
      <p className="remix-box-headline" dir="auto">{result.headline}</p>
      {result.score !== null && <p className="remix-box-score">{scoreLabel}: {result.score}</p>}
      {notes.length > 0 && <details className="remix-box-notes"><summary>{notesLabel}</summary><ul>{notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
      {url && <a className="button secondary" href={url} download={imageFileName('admorph-remix', result.blob)}>{downloadLabel}</a>}
    </div>
  </article>;
}

const THEME_GRADIENT: Record<RemixThemeId, string> = { ramadan: 'linear-gradient(135deg,#0e5a3c,#d4af37)', eid: 'linear-gradient(135deg,#0f766e,#f5d76e)', 'black-friday': 'linear-gradient(135deg,#16100c,#df543a)', summer: 'linear-gradient(135deg,#7ed3e0,#f5a623)' };

type SourceFilter = 'all' | 'oneshot' | 'shelf' | 'copies';
const inFilter = (ad: SavedAd, filter: SourceFilter) => filter === 'all' || (filter === 'copies' ? ad.source === 'variants' || ad.source === 'themes' : ad.source === filter);

/** Shared studio for the two remix pages: pick a saved ad, make new
 *  versions of it. Variants change the angle; themes restyle it for a
 *  season. Both reuse the planner, the remix image edit, and the
 *  one-shot certificate — no new provider, no new model roles. */
export default function AdRemixStudio({ mode }: { mode: 'variants' | 'themes' }) {
  const m = useMessages(), t = m.remix, workspace = useWorkspace(), provider = useProviderSession();
  const [ads, setAds] = useState<SavedAd[]>([]);
  const [selected, setSelected] = useState<SavedAd | null>(null);
  const [count, setCount] = useState(2);
  const [themes, setThemes] = useState<RemixThemeId[]>(['ramadan']);
  const [results, setResults] = useState<RemixResult[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(0);
  const [notice, setNotice] = useState('');
  const [armingDelete, setArmingDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const strip = useRef<HTMLDivElement | null>(null);
  // Variants make several requests in a row; a per-minute limit pauses and retries instead of failing.
  const [waitSeconds, setWaitSeconds] = useState(0);
  const onWait = (seconds: number) => setWaitSeconds(seconds);

  const imageModel = provider.taskModel('image');
  const plannerModel = provider.taskModel('planner');
  const key = provider.configs.meta.apiKey.trim();
  const errorText = { errors: m.settings.errors, aiError: m.meta.aiError };
  // New copies are written in the language of the ad they come from (an
  // Arabic ad gets Arabic variants), not in the language of the interface.
  const languageOf = (ad: SavedAd | null): 'en' | 'ar' => ad?.headline.trim() ? (/[\u0600-\u06FF]/.test(ad.headline) ? 'ar' : 'en') : workspace.locale === 'ar' ? 'ar' : 'en';
  const language = languageOf(selected);

  // The gallery links here with ?ad=<id>; that ad starts selected.
  const preselect = useSearchParams().get('ad');
  useEffect(() => {
    let alive = true;
    loadSavedAds().then(items => { if (!alive) return; setAds(items); const match = preselect ? items.find(item => item.id === preselect) : undefined; if (match) setSelected(match); }).catch(() => {});
    return () => { alive = false; };
  }, [preselect]);

  async function refreshGallery() {
    try { setAds(await loadSavedAds()); } catch { /* gallery is best-effort */ }
  }

  function remixLayout(headline: string): OneshotElement[] {
    return [
      { id: 'product', kind: 'product', x: 340, y: 400, width: 400, height: 550 },
      { id: 'logo', kind: 'logo', x: 830, y: 40, width: 200, height: 80 },
      { id: 'headline', kind: 'text', x: 90, y: 90, width: 900, height: 120, text: headline },
    ];
  }

  /** One remix and its review. A seasonal copy that shows too few season
   *  cues is painted once more and the better of the two is kept. */
  async function runJob(source: SavedAd, image: Blob, fromProduct: boolean, headline: string, scene: string, theme?: RemixThemeId, axis?: VariantAxis) {
    if (!imageModel) return;
    const paint = async (headline: string, scene: string) => {
      const remixResponse = await withRateLimit(async () => { const response = await metaFetch('image_edit', '/api/ai/ad-remix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(image), brand: source.brand, scene, headline, language, source: fromProduct ? 'product' : 'ad', ...(theme ? { theme } : {}) }), signal: AbortSignal.timeout(65000) }); await requireMetaSuccess(response); return response; }, onWait);
      const blob = await remixResponse.blob(); await validateGeneratedImage(blob);
      let score: number | null = null, certificate: VerifyResult | null = null;
      const verifyModel = provider.taskModel('vision') ?? provider.taskModel('critic');
      if (verifyModel) {
        const fittedResult = await fitProductImage(blob);
        const verifyResponse = await withRateLimit(async () => { const response = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: verifyModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fittedResult), layout: remixLayout(headline), language, ...(theme ? { season: theme } : {}) }), signal: AbortSignal.timeout(65000) }); await requireMetaSuccess(response); return response; }, onWait);
        certificate = verifyResultSchema.parse(await verifyResponse.json());
        score = oneshotScore(certificate, false) - (theme && (certificate.seasonCues?.length ?? 0) < MIN_SEASON_CUES ? 20 : 0);
      }
      return { blob, score, certificate };
    };
    let best: Awaited<ReturnType<typeof paint>>;
    try { best = await paint(headline, scene); }
    catch (cause) {
      // Meta refused this picture: paint once more from a plain scene and headline.
      if (!(cause instanceof ProviderError && cause.code === 'plan_blocked')) throw cause;
      headline = theme ? SEASON_FALLBACK_HEADLINE[theme][language] : headline;
      scene = theme ? seasonFallbackScene(theme) : NEUTRAL_VARIANT_SCENES[0];
      best = await paint(headline, scene);
      setNotice(t.fallbackUsed);
    }
    if (theme && best.certificate && (best.certificate.seasonCues?.length ?? 0) < MIN_SEASON_CUES) {
      const again = await paint(headline, scene);
      if ((again.score ?? -1) > (best.score ?? -1)) best = again;
    }
    const result: RemixResult = { id: crypto.randomUUID(), blob: best.blob, headline, score: best.score === null ? null : Math.max(0, best.score), certificate: best.certificate, ...(axis ? { axis } : {}) };
    setResults(previous => [...previous, result]);
    try { await saveAd({ id: crypto.randomUUID(), blob: best.blob, source: mode, brand: source.brand, headline, hasLogo: false, createdAt: new Date().toISOString(), scene, format: '1080x1350', ...(source.cutout ? { cutout: source.cutout } : {}) }); } catch { /* gallery is best-effort */ }
  }

  const isFallbackable = (cause: unknown) => cause instanceof ProviderError && (FALLBACK_CODES as readonly string[]).includes(cause.code);

  async function generate() {
    if (!selected || !plannerModel || !imageModel || !key || busy) return;
    setBusy('plan'); setError(''); setResults([]); setFailed(0); setNotice('');
    // On a phone the boxes sit below the options: bring them into view so the painting is visible.
    if (window.matchMedia('(max-width: 979px)').matches) requestAnimationFrame(() => document.getElementById('remix-results-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    try {
      const brand: BrandInput = selected.brand;
      // A finished ad is a photographic PNG that can exceed the 2 MB
      // image cap the server enforces on every op. Fit it first, exactly
      // like one-shot fits its mockup and result — otherwise the planner,
      // the remix and the verify all fail with invalid_request.
      const fittedSource = await fitProductImage(selected.blob);
      // Redesign from the product cutout when the ad kept one, so each copy
      // is a new design rather than a repaint of the finished ad.
      const fromProduct = !!selected.cutout;
      const remixImage = selected.cutout ? await fitProductImage(selected.cutout) : fittedSource;
      const encodedSource = await encodeProduct(fittedSource);
      let jobs: { headline: string; scene: string; theme?: RemixThemeId; axis?: VariantAxis }[] = [];
      if (mode === 'variants') {
        // Each variant moves along its own axis, away from the source ad's scene and the latest ones.
        const recent = await loadRecentScenes().catch(() => [] as string[]);
        const avoidScenes = [...(selected.scene ? [settingOf(selected.scene)] : []), ...recent].filter(Boolean).slice(0, 5);
        const axisBrief = `Variants of an existing ad${selected.headline ? ` whose headline was ${JSON.stringify(selected.headline)}` : ''}${selected.scene ? ` and whose scene was ${JSON.stringify(selected.scene.slice(0, 300))}` : ''}. ${VARIANT_AXES.map((axis, index) => `Concept ${index + 1}: ${axis.instruction}.`).join(' ')} Every headline must differ from the original.`;
        try {
          const plan = await withRateLimit(() => requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: axisBrief, looks: pickLooks(count), goal: 'awareness', creativeLanguage: language, format: '1080x1350', ...(avoidScenes.length ? { avoidScenes } : {}), product: encodedSource }, AbortSignal.timeout(65000)), onWait);
          jobs = plan.concepts.slice(0, count).map((item, index) => ({ headline: item.headline, scene: item.artBrief ? artBriefToScene(item.artBrief) : item.visualDirection, axis: VARIANT_AXES[index]?.id }));
        } catch (cause) {
          if (!isFallbackable(cause)) throw cause;
          // The planner refused: keep the ad's own headline and give each variant a plain scene of its own.
          jobs = NEUTRAL_VARIANT_SCENES.slice(0, count).map((scene, index) => ({ headline: selected.headline || brand.name, scene, axis: VARIANT_AXES[index]?.id }));
          setNotice(t.fallbackUsed);
        }
      } else {
        for (const themeId of themes) {
          const theme = REMIX_THEMES.find(item => item.id === themeId)!;
          try {
            const plan = await withRateLimit(() => requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: `Seasonal theme: ${theme.id}. Palette: ${theme.palette}. Visible cues: ${theme.cues.join('; ')}. Write a ${theme.id} headline and a scene direction set in a real place where this product is naturally used, dressed for ${theme.id} with these cues around the product.`, looks: pickLooks(1), goal: 'awareness', creativeLanguage: language, format: '1080x1350', product: encodedSource }, AbortSignal.timeout(65000)), onWait);
            const first = plan.concepts[0];
            if (first) jobs.push({ headline: first.headline, scene: first.artBrief ? artBriefToScene(first.artBrief) : first.visualDirection, theme: themeId });
          } catch (cause) {
            if (!isFallbackable(cause)) throw cause;
            // The planner refused this season for this ad: use the plain seasonal greeting and props.
            jobs.push({ headline: SEASON_FALLBACK_HEADLINE[themeId][language], scene: seasonFallbackScene(themeId), theme: themeId });
            setNotice(t.fallbackUsed);
          }
        }
      }
      setBusy('generate');
      let failures = 0;
      for (const job of jobs) {
        try { await runJob(selected, remixImage, fromProduct, job.headline, job.scene, job.theme, job.axis); }
        catch (cause) { failures += 1; setError(metaErrorMessage(cause, errorText)); }
      }
      setFailed(failures);
      await refreshGallery();
    } catch (cause) { setError(metaErrorMessage(cause, errorText)); }
    finally { setBusy(''); }
  }

  async function removeAd(ad: SavedAd) {
    if (armingDelete !== ad.id) { setArmingDelete(ad.id); return; }
    setArmingDelete(null);
    try { await deleteSavedAd(ad.id); setAds(previous => previous.filter(item => item.id !== ad.id)); if (selected?.id === ad.id) setSelected(null); setNotice(t.deleted); }
    catch { setError(t.deleteFailed); }
  }

  const canGenerate = !!selected && !!plannerModel && !!imageModel && !!key && !busy && (mode === 'variants' || themes.length > 0);
  const busyLabel = busy === 'plan' ? t.planning : busy === 'generate' ? t.generating : '';
  const expected = mode === 'variants' ? count : themes.length;

  // The guided demo makes the Ramadan version of the ad it just painted.
  useDemoDriver(mode === 'themes' ? 'themes' : null, async (id, phase, memory) => {
    if (id !== 'season') return 'wait';
    if (phase === 0) {
      const match = memory.adId ? ads.find(ad => ad.id === memory.adId) : ads[0];
      // The gallery write of a fresh ad can land a moment after the page opens.
      if (!match) { await refreshGallery(); return 'wait'; }
      setSelected(match); setThemes(['ramadan']); setFilter('all');
      return 'next';
    }
    if (phase === 1) { if (!canGenerate) return 'wait'; await generate(); return 'next'; }
    if (busy) return 'wait';
    if (results.length === 0) throw new Error(error || 'season');
    return 'done';
  });
  const themeLabel = (id: RemixThemeId | undefined) => id === 'ramadan' ? t.themeRamadan : id === 'eid' ? t.themeEid : id === 'black-friday' ? t.themeBlackFriday : id === 'summer' ? t.themeSummer : undefined;
  const visible = ads.filter(ad => inFilter(ad, filter));
  const filters = (['all', 'oneshot', 'shelf', 'copies'] as const).filter(item => item === 'all' || ads.some(ad => inFilter(ad, item)));
  const filterLabel = { all: t.filterAll, oneshot: t.filterOneshot, shelf: t.filterShelf, copies: t.filterCopies };
  const sourceHint = useObjectUrl(selected?.cutout ?? selected?.blob ?? null);
  function pick(ad: SavedAd) { setSelected(ad); setArmingDelete(null); }
  function step(delta: number) {
    if (!visible.length) return;
    const at = selected ? visible.findIndex(ad => ad.id === selected.id) : -1;
    pick(visible[(at + delta + visible.length) % visible.length]);
  }
  // Keep the picked thumbnail in view (also when the gallery preselects one).
  useEffect(() => {
    const node = strip.current?.querySelector('[data-selected]');
    if (node && 'scrollIntoView' in node) (node as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected, filter]);

  return <>
    <div className="page-head reveal-up"><div><h1>{mode === 'variants' ? t.titleVariants : t.titleThemes}</h1>
    <p>{mode === 'variants' ? t.descriptionVariants : t.descriptionThemes}</p></div></div>
    {!key && <p className="campaign-notice"><Link href="/settings">{t.needKey}</Link></p>}
    <div className="remix-layout" data-mode={mode}>
      <div className="remix-side">
        <section className="remix-panel" aria-labelledby="remix-pick-title">
          <header className="remix-panel-head"><span className="remix-step">1</span><h2 id="remix-pick-title">{t.stepPick}</h2>{ads.length > 0 && <small>{t.savedCount.replace('{n}', String(ads.length))}</small>}</header>
          {ads.length === 0
            ? <p className="remix-empty">{t.emptyGallery} <Link href="/oneshot">{t.emptyGalleryHint}</Link></p>
            : <>
              {selected
                ? <SelectedPreview ad={selected} labels={{ delete: t.delete, confirmDelete: t.confirmDelete, prev: t.prev, next: t.next, selected: t.selected }} onDelete={() => void removeAd(selected)} armed={armingDelete === selected.id} disabled={busy !== ''} onStep={step} canStep={visible.length > 1} />
                : <div className="remix-hero is-empty"><strong>{t.noSelection}</strong><span>{t.noSelectionHint}</span></div>}
              {filters.length > 2 && <div className="remix-filters" role="group" aria-label={t.pickSource}>{filters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{filterLabel[item]}</button>)}</div>}
              <div className="remix-strip" ref={strip} role="group" aria-label={t.pickSource}>
                {visible.map(ad => <SavedAdCard key={ad.id} ad={ad} selected={selected?.id === ad.id} onSelect={() => pick(ad)} disabled={busy !== ''} />)}
                {visible.length === 0 && <p className="remix-empty">{t.noneInFilter}</p>}
              </div>
              <p className="remix-hint">{t.pickHint}</p>
            </>}
        </section>

        <section className="remix-panel" aria-labelledby="remix-options-title">
          <header className="remix-panel-head"><span className="remix-step">2</span><h2 id="remix-options-title">{mode === 'variants' ? t.countLabel : t.themesLabel}</h2></header>
          {mode === 'variants' && <div className="segmented remix-count" role="group" aria-label={t.countLabel}>{[2, 3].map(value => <button key={value} type="button" aria-pressed={count === value} disabled={busy !== ''} onClick={() => setCount(value)}>{value}</button>)}</div>}
          {mode === 'themes' && <div className="theme-pick-grid">
            {REMIX_THEMES.map(theme => {
              const label = theme.id === 'ramadan' ? t.themeRamadan : theme.id === 'eid' ? t.themeEid : theme.id === 'black-friday' ? t.themeBlackFriday : t.themeSummer;
              const checked = themes.includes(theme.id);
              return <button key={theme.id} type="button" className={checked ? 'theme-pick selected' : 'theme-pick'} aria-pressed={checked} disabled={busy !== '' || (!checked && themes.length >= 3)} onClick={() => setThemes(previous => checked ? previous.filter(item => item !== theme.id) : [...previous, theme.id])}><span className="theme-pick-strip" style={{ background: THEME_GRADIENT[theme.id] }} /><strong>{label}</strong></button>;
            })}
          </div>}
          <button type="button" className="button primary remix-go" disabled={!canGenerate} onClick={() => void generate()}>{busy ? <WaitingText label={busyLabel} /> : mode === 'variants' ? t.generateVariants : t.generateThemes}</button>
          {waitSeconds > 0 && <p className="request-status" role="status" data-testid="remix-rate-wait">{m.shelf.rateWait.replace('{s}', String(waitSeconds))}</p>}
        </section>
      </div>

      <section className="remix-panel remix-results" aria-labelledby="remix-results-title">
        <header className="remix-panel-head"><span className="remix-step">3</span><h2 id="remix-results-title">{mode === 'variants' ? t.resultsVariants : t.resultsThemes}</h2></header>
        {error && <p className="request-error" role="alert">{error}</p>}
        {notice && <p className="request-status" role="status">{notice}</p>}
        {failed > 0 && <p role="status">{t.failedSome}</p>}
        <div className="remix-boxes">
          {Array.from({ length: Math.max(expected, results.length) }).map((_, index) => {
            if (index < results.length) {
              const result = results[index];
              return <ResultCard key={result.id} index={index} result={result} downloadLabel={t.download} scoreLabel={t.score} notesLabel={t.reviewNotes} axisLabel={result.axis ? t[`axis_${result.axis}`] : undefined} />;
            }
            const active = busy === 'plan' || (busy === 'generate' && index === results.length);
            const queued = busy === 'generate' && index > results.length;
            const label = mode === 'themes' ? themeLabel(themes[index]) : undefined;
            return <div key={`slot-${index}`} data-testid="remix-slot" className={`remix-box remix-slot${active ? ' is-busy' : ''}`}>
              <div className="remix-box-media">
                {active
                  ? <GeneratingCanvas colors={selected?.brand.colors} hint={sourceHint}><WaitingText label={busy === 'plan' ? t.planning : t.generating} /></GeneratingCanvas>
                  : <span className="remix-slot-empty">{queued ? t.slotQueued : t.emptySlot}</span>}
                {label && <span className="remix-axis">{label}</span>}
              </div>
            </div>;
          })}
        </div>
      </section>
    </div>
  </>;
}
