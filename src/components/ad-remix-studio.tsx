'use client';
import { imageFileName } from '@/lib/image-name';
import { useEffect, useState } from 'react';
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
import { withRateLimit } from '@/lib/shelf/queue';

type RemixResult = { id: string; blob: Blob; headline: string; score: number | null; certificate: VerifyResult | null; axis?: VariantAxis };

function SavedAdCard({ ad, selected, onSelect, onDelete, armed, deleteLabel, confirmLabel, selectedLabel, disabled }: { ad: SavedAd; selected: boolean; onSelect: () => void; onDelete: () => void; armed: boolean; deleteLabel: string; confirmLabel: string; selectedLabel: string; disabled: boolean }) {
  const url = useObjectUrl(ad.blob);
  return <article className="remix-source-card" data-testid="remix-source-card">
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect}>
      {url && <img src={url} alt="" style={{ maxWidth: '100%' }} />}
      <span>{ad.brand.name} — {ad.headline || ad.source} — {ad.createdAt.slice(0, 10)}</span>
      {selected && <strong>{selectedLabel}</strong>}
    </button>
    <button type="button" className="button secondary danger" disabled={disabled} onClick={onDelete}>{armed ? confirmLabel : deleteLabel}</button>
  </article>;
}

function ResultCard({ result, downloadLabel, scoreLabel, axisLabel }: { result: RemixResult; downloadLabel: string; scoreLabel: string; axisLabel?: string }) {
  const url = useObjectUrl(result.blob);
  return <article data-testid="remix-result">
    {axisLabel && <span className="remix-axis" data-testid="remix-axis">{axisLabel}</span>}
    {url && <img className="media-reveal" src={url} alt="" style={{ maxWidth: '100%' }} />}
    <p>{result.headline}</p>
    {result.score !== null && <p>{scoreLabel}: {result.score}</p>}
    {result.certificate && <ul>
      <li>{result.certificate.productNote}</li>
      <li>{result.certificate.logoNote}</li>
      <li>{result.certificate.layoutNote}</li>
    </ul>}
    {url && <a className="button secondary" href={url} download={imageFileName('admorph-remix', result.blob)}>{downloadLabel}</a>}
  </article>;
}

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
          const plan = await withRateLimit(() => requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: axisBrief, goal: 'awareness', creativeLanguage: language, format: '1080x1350', ...(avoidScenes.length ? { avoidScenes } : {}), product: encodedSource }, AbortSignal.timeout(65000)), onWait);
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
            const plan = await withRateLimit(() => requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: `Seasonal theme: ${theme.id}. Palette: ${theme.palette}. Visible cues: ${theme.cues.join('; ')}. Write a ${theme.id} headline and a scene direction that places the product among these cues.`, goal: 'awareness', creativeLanguage: language, format: '1080x1350', product: encodedSource }, AbortSignal.timeout(65000)), onWait);
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

  return <>
    <div className="page-head reveal-up"><div><h1>{mode === 'variants' ? t.titleVariants : t.titleThemes}</h1>
    <p>{mode === 'variants' ? t.descriptionVariants : t.descriptionThemes}</p></div></div>
    <section className="feature-card">
    {!key && <p><Link href="/settings">{t.needKey}</Link></p>}
    {error && <p className="request-error" role="alert">{error}</p>}
    {notice && <p className="request-status" role="status">{notice}</p>}
    {waitSeconds > 0 && <p className="request-status" role="status" data-testid="remix-rate-wait">{m.shelf.rateWait.replace('{s}', String(waitSeconds))}</p>}
    <h2>{t.pickSource}</h2>
    {ads.length === 0 && <p>{t.emptyGallery} <Link href="/oneshot">{t.emptyGalleryHint}</Link></p>}
    <div className="remix-source-grid">{ads.map(ad => <SavedAdCard key={ad.id} ad={ad} selected={selected?.id === ad.id} onSelect={() => setSelected(ad)} onDelete={() => void removeAd(ad)} armed={armingDelete === ad.id} deleteLabel={t.delete} confirmLabel={t.confirmDelete} selectedLabel={t.selected} disabled={busy !== ''} />)}</div>
    {mode === 'variants' && <fieldset className="segmented-fieldset"><legend>{t.countLabel}</legend><div className="segmented" role="group" aria-label={t.countLabel}>{[2, 3].map(value => <button key={value} type="button" aria-pressed={count === value} disabled={busy !== ''} onClick={() => setCount(value)}>{value}</button>)}</div></fieldset>}
    {mode === 'themes' && <fieldset className="theme-pick-fieldset">
      <legend>{t.themesLabel}</legend>
      <div className="theme-pick-grid">
      {REMIX_THEMES.map(theme => {
        const label = theme.id === 'ramadan' ? t.themeRamadan : theme.id === 'eid' ? t.themeEid : theme.id === 'black-friday' ? t.themeBlackFriday : t.themeSummer;
        const checked = themes.includes(theme.id);
        return <button key={theme.id} type="button" className={checked ? 'theme-pick selected' : 'theme-pick'} aria-pressed={checked} disabled={busy !== '' || (!checked && themes.length >= 3)} onClick={() => setThemes(previous => checked ? previous.filter(item => item !== theme.id) : [...previous, theme.id])}><span className="theme-pick-strip" style={{ background: theme.id === 'ramadan' ? 'linear-gradient(135deg,#0e5a3c,#d4af37)' : theme.id === 'eid' ? 'linear-gradient(135deg,#0f766e,#f5d76e)' : theme.id === 'black-friday' ? 'linear-gradient(135deg,#16100c,#df543a)' : 'linear-gradient(135deg,#7ed3e0,#f5a623)' }} /><strong>{label}</strong></button>;
      })}
      </div>
    </fieldset>}
    <button type="button" className="button primary" disabled={!canGenerate} onClick={() => void generate()}>{busy ? <WaitingText label={busyLabel} /> : mode === 'variants' ? t.generateVariants : t.generateThemes}</button>
    {failed > 0 && <p role="status">{t.failedSome}</p>}
    {selected && expected > 0 && <div>
      <h2>{mode === 'variants' ? t.resultsVariants : t.resultsThemes}</h2>
      {Array.from({ length: expected }).map((_, index) => index < results.length
        ? <ResultCard key={results[index].id} result={results[index]} downloadLabel={t.download} scoreLabel={t.score} axisLabel={results[index].axis ? t[`axis_${results[index].axis}`] : undefined} />
        : <div key={`slot-${index}`} data-testid="remix-slot" className="remix-slot"><p>{t.emptySlot}</p></div>)}
    </div>}
  </section>
  </>;
}
