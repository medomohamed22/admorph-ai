'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { encodeProduct, fitProductImage, validateGeneratedImage, requestPlan } from '@/lib/campaign/client';
import { oneshotScore, verifyResultSchema, type OneshotElement, type VerifyResult } from '@/lib/ai/oneshot';
import { REMIX_THEMES, type RemixThemeId } from '@/lib/ai/remix';
import { loadSavedAds, saveAd, deleteSavedAd } from '@/lib/db/repository';
import type { SavedAd, BrandInput } from '@/lib/db/schema';
import { useObjectUrl } from './logo';
import { WaitingText } from './waiting';

type RemixResult = { id: string; blob: Blob; headline: string; score: number | null; certificate: VerifyResult | null };

function SavedAdCard({ ad, selected, onSelect, onDelete, armed, deleteLabel, confirmLabel, selectedLabel, disabled }: { ad: SavedAd; selected: boolean; onSelect: () => void; onDelete: () => void; armed: boolean; deleteLabel: string; confirmLabel: string; selectedLabel: string; disabled: boolean }) {
  const url = useObjectUrl(ad.blob);
  return <article data-testid="remix-source-card">
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect} style={selected ? { outline: '3px solid #16100C', outlineOffset: '3px' } : undefined}>
      {url && <img src={url} alt="" style={{ maxWidth: '100%' }} />}
      <span>{ad.brand.name} — {ad.headline || ad.source} — {ad.createdAt.slice(0, 10)}</span>
      {selected && <strong>{selectedLabel}</strong>}
    </button>
    <button type="button" className="button secondary danger" disabled={disabled} onClick={onDelete}>{armed ? confirmLabel : deleteLabel}</button>
  </article>;
}

function ResultCard({ result, downloadLabel, scoreLabel }: { result: RemixResult; downloadLabel: string; scoreLabel: string }) {
  const url = useObjectUrl(result.blob);
  return <article data-testid="remix-result">
    {url && <img className="media-reveal" src={url} alt="" style={{ maxWidth: '100%' }} />}
    <p>{result.headline}</p>
    {result.score !== null && <p>{scoreLabel}: {result.score}</p>}
    {result.certificate && <ul>
      <li>{result.certificate.productNote}</li>
      <li>{result.certificate.logoNote}</li>
      <li>{result.certificate.layoutNote}</li>
    </ul>}
    {url && <a className="button secondary" href={url} download="admorph-remix.png">{downloadLabel}</a>}
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

  const imageModel = provider.taskModel('image');
  const plannerModel = provider.taskModel('planner');
  const key = provider.configs.meta.apiKey.trim();
  const errorText = { errors: m.settings.errors, aiError: m.meta.aiError };
  const language = workspace.locale === 'ar' ? 'ar' : 'en';

  useEffect(() => {
    let alive = true;
    loadSavedAds().then(items => { if (alive) setAds(items); }).catch(() => {});
    return () => { alive = false; };
  }, []);

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

  async function runJob(source: SavedAd, fittedSource: Blob, headline: string, scene: string) {
    if (!imageModel) return;
    const remixResponse = await metaFetch('image_edit', '/api/ai/ad-remix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fittedSource), brand: source.brand, scene, headline, language }), signal: AbortSignal.timeout(65000) });
    await requireMetaSuccess(remixResponse);
    const blob = await remixResponse.blob(); await validateGeneratedImage(blob);
    let score: number | null = null, certificate: VerifyResult | null = null;
    const verifyModel = provider.taskModel('vision') ?? provider.taskModel('critic');
    if (verifyModel) {
      const fittedResult = await fitProductImage(blob);
      const verifyResponse = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: verifyModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(fittedResult), layout: remixLayout(headline), language }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(verifyResponse);
      certificate = verifyResultSchema.parse(await verifyResponse.json());
      score = oneshotScore(certificate, source.hasLogo);
    }
    const result: RemixResult = { id: crypto.randomUUID(), blob, headline, score, certificate };
    setResults(previous => [...previous, result]);
    try { await saveAd({ id: crypto.randomUUID(), blob, source: mode, brand: source.brand, headline, hasLogo: source.hasLogo, createdAt: new Date().toISOString() }); } catch { /* gallery is best-effort */ }
  }

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
      let jobs: { headline: string; scene: string }[] = [];
      if (mode === 'variants') {
        const plan = await requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: '', goal: 'awareness', creativeLanguage: language, format: '1080x1350', product: await encodeProduct(fittedSource) }, AbortSignal.timeout(65000));
        jobs = plan.concepts.slice(0, count).map(item => ({ headline: item.headline, scene: item.visualDirection }));
      } else {
        for (const themeId of themes) {
          const theme = REMIX_THEMES.find(item => item.id === themeId)!;
          const plan = await requestPlan({ providerId: 'meta', apiKey: key, modelId: plannerModel.modelId, consent: true, imageConsent: true, brand, brief: `Seasonal theme: ${theme.id} — ${theme.scene}. Create concepts with a ${theme.id} headline angle and scene direction.`, goal: 'awareness', creativeLanguage: language, format: '1080x1350', product: await encodeProduct(fittedSource) }, AbortSignal.timeout(65000));
          const first = plan.concepts[0];
          if (first) jobs.push({ headline: first.headline, scene: first.visualDirection });
        }
      }
      setBusy('generate');
      let failures = 0;
      for (const job of jobs) {
        try { await runJob(selected, fittedSource, job.headline, job.scene); }
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
    <h2>{t.pickSource}</h2>
    {ads.length === 0 && <p>{t.emptyGallery} <Link href="/oneshot">{t.emptyGalleryHint}</Link></p>}
    <div>{ads.map(ad => <SavedAdCard key={ad.id} ad={ad} selected={selected?.id === ad.id} onSelect={() => setSelected(ad)} onDelete={() => void removeAd(ad)} armed={armingDelete === ad.id} deleteLabel={t.delete} confirmLabel={t.confirmDelete} selectedLabel={t.selected} disabled={busy !== ''} />)}</div>
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
        ? <ResultCard key={results[index].id} result={results[index]} downloadLabel={t.download} scoreLabel={t.score} />
        : <div key={`slot-${index}`} data-testid="remix-slot" className="remix-slot"><p>{t.emptySlot}</p></div>)}
    </div>}
  </section>
  </>;
}
