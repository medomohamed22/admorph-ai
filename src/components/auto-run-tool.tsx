'use client';
import { useEffect, useRef, useState } from 'react';
import { useMessages } from './workspace';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import { validateProduct } from '@/lib/campaign/client';
import { ProviderError } from '@/lib/ai/errors';
import { cutoutImage } from '@/lib/cutout/provider';
import { getDatabase } from '@/lib/db/dexie';
import type { Asset } from '@/lib/db/schema';
import type { Creative } from '@/lib/editor/schema';
import { buildBackgroundBrief, dominantColors, type BackgroundStyle } from '@/lib/background/brief';
import { paintLocalBackground } from '@/lib/background/local';
import { blobToImageData, canvasToBlob } from '@/lib/browser/image-data';
import {
  autoRunRecordSchema,
  createRun,
  finishRun,
  markStep,
  nextPendingStep,
  preflight,
  resetFrom,
  type AutoRunRecord,
  type AutoRunStepId,
} from '@/lib/auto-run/runner';
import { buildAutoCopy, composeAutoAd } from '@/lib/auto-run/compose';
import { checkCreative } from '@/lib/critic/rules';

/**
 * Single-run auto-ads orchestrator (unlinked route, not the landing default).
 * No-key mode only: every step runs locally in the browser. No image, key
 * or text is sent to any service, and there is no cost. One combined
 * consent covers the six local steps; new network requests would need a
 * fresh consent, and none are made here.
 */
export function AutoRunTool() {
  const m = useMessages();
  const t = m.autoRun;
  const [brandName, setBrandName] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [colors, setColors] = useState<[string, string, string]>(['#16100C', '#F5EEDF', '#7ED3E0']);
  const [category, setCategory] = useState('');
  const [typeHint, setTypeHint] = useState<'can' | 'bottle' | 'box' | 'cup' | 'other'>('can');
  const [stylePreset, setStylePreset] = useState<BackgroundStyle>('hero');
  const [product, setProduct] = useState<{ blob: Blob; url: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [run, setRun] = useState<AutoRunRecord | null>(null);
  const [pastRuns, setPastRuns] = useState<AutoRunRecord[]>([]);
  const [hero, setHero] = useState<Creative | null>(null);
  const [heroAssets, setHeroAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const heroHandle = useRef<CanvasHandle | null>(null);

  useEffect(() => {
    let alive = true;
    getDatabase()
      .autoRuns.orderBy('createdAt')
      .reverse()
      .toArray()
      .then((rows) => {
        if (!alive) return;
        setPastRuns(
          rows.flatMap((row) => {
            const parsed = autoRunRecordSchema.safeParse(row);
            return parsed.success ? [parsed.data] : [];
          }),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function persist(working: AutoRunRecord) {
    await getDatabase()
      .autoRuns.put(working)
      .catch(() => undefined);
    setPastRuns((rows) => {
      const next = rows.filter((row) => row.id !== working.id);
      return [working, ...next].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    });
  }

  async function resolveProductBlob(working: AutoRunRecord): Promise<Blob | null> {
    if (product) return product.blob;
    if (!working.productAssetId) return null;
    const asset = await getDatabase().assets.get(working.productAssetId);
    return asset?.blob ?? null;
  }

  async function loadHeroAssets(working: AutoRunRecord) {
    const ids = [working.productAssetId, working.cutoutAssetId, working.backgroundAssetId];
    const db = getDatabase();
    const found: Asset[] = [];
    for (const id of ids) {
      if (!id) continue;
      const asset = await db.assets.get(id);
      if (asset) found.push(asset);
    }
    setHeroAssets(found);
  }

  async function execute(starting: AutoRunRecord, from: AutoRunStepId) {
    const signal = abort.current?.signal;
    let working = starting;
    let current: AutoRunStepId = from;
    const stepOrder: AutoRunStepId[] = ['cutout', 'analysis', 'backgrounds', 'composition', 'copy', 'review'];
    try {
      for (const id of stepOrder.slice(stepOrder.indexOf(from))) {
        current = id;
        signal?.throwIfAborted();
        working = markStep(working, id, 'running');
        setRun(working);
        if (id === 'cutout') {
          const blob = await resolveProductBlob(working);
          if (!blob) throw new Error('product');
          if (!working.productAssetId) {
            const productAsset: Asset = {
              id: crypto.randomUUID(),
              kind: 'product',
              blob,
              createdAt: new Date().toISOString(),
            };
            await getDatabase().assets.put(productAsset);
            working = { ...working, productAssetId: productAsset.id };
          }
          const result = await cutoutImage(blob, 'local');
          const cutoutAsset: Asset = {
            id: crypto.randomUUID(),
            kind: 'cutout',
            blob: result.cutoutBlob,
            createdAt: new Date().toISOString(),
            meta: {
              derivedFrom: working.productAssetId ?? undefined,
              provider: 'local',
              sourceWidth: result.sourceWidth,
              sourceHeight: result.sourceHeight,
              reliable: result.reliable,
            },
          };
          await getDatabase().assets.put(cutoutAsset);
          working = { ...working, cutoutAssetId: cutoutAsset.id };
        } else if (id === 'analysis') {
          const blob = await resolveProductBlob(working);
          if (!blob) throw new Error('product');
          const image = await blobToImageData(blob);
          const dominant = dominantColors(image.data, image.width, image.height);
          const brief = buildBackgroundBrief({
            productCategory: working.productCategory || 'product',
            typeHint: typeHint,
            brandColors: working.brandColors,
            stylePreset: working.stylePreset,
          });
          working = { ...working, brief, dominantColors: dominant };
        } else if (id === 'backgrounds') {
          const canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1350;
          paintLocalBackground(canvas.getContext('2d')!, working.brandColors);
          const blob = await canvasToBlob(canvas);
          const backgroundAsset: Asset = {
            id: crypto.randomUUID(),
            kind: 'background',
            blob,
            createdAt: new Date().toISOString(),
          };
          await getDatabase().assets.put(backgroundAsset);
          working = { ...working, backgroundAssetId: backgroundAsset.id };
        } else if (id === 'composition') {
          if (!working.brief || !working.cutoutAssetId || !working.backgroundAssetId) {
            throw new Error('missing_step_output');
          }
          working = {
            ...working,
            hero: composeAutoAd({
              brandName: working.brandName,
              brandColors: working.brandColors,
              brief: working.brief,
              cutoutAssetId: working.cutoutAssetId,
              backgroundAssetId: working.backgroundAssetId,
              tagline: working.brandName,
              caption: '',
              cta: t.ctaDefault,
            }),
          };
        } else if (id === 'copy') {
          if (!working.hero) throw new Error('missing_step_output');
          const copy = buildAutoCopy(
            working.brandName,
            working.productCategory || 'product',
            working.brandDescription,
          );
          const headline = working.hero.layers.find((layer) => layer.kind === 'headline');
          const hero: Creative = {
            ...working.hero,
            caption: copy.caption,
            layers: working.hero.layers.map((layer) =>
              layer.id === headline?.id ? { ...layer, text: copy.tagline } : layer,
            ),
          };
          working = { ...working, hero, tagline: copy.tagline, caption: copy.caption };
        } else if (id === 'review') {
          if (!working.hero) throw new Error('missing_step_output');
          const assetIds = new Set(
            [working.productAssetId, working.cutoutAssetId, working.backgroundAssetId].filter(
              (value): value is string => !!value,
            ),
          );
          const result = checkCreative(working.hero, {}, assetIds);
          working = { ...working, reviewCodes: [...new Set(result.issues.map((issue) => issue.code))] };
        }
        working = markStep(working, id, 'done');
        setRun(working);
        await persist(working);
      }
      working = finishRun(working, 'done');
      setRun(working);
      await persist(working);
      if (working.hero) {
        setHero(working.hero);
        await loadHeroAssets(working);
      }
    } catch (cause) {
      if (signal?.aborted) {
        working = markStep(working, current, 'pending');
        working = finishRun(working, 'cancelled');
        setRun(working);
        await persist(working);
        setError('');
      } else {
        const message = cause instanceof Error ? cause.message : 'failed';
        working = markStep(working, current, 'failed', message);
        working = finishRun(working, 'failed', message);
        setRun(working);
        await persist(working);
        setError(message === 'product' ? t.preflight.product : t.errors.failed);
      }
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (busy) return;
    const problems = preflight({ brandName, brandColors: colors });
    if (problems.length > 0) {
      setError(t.preflight[problems[0] as keyof typeof t.preflight]);
      return;
    }
    if (!product) {
      setError(t.preflight.product);
      return;
    }
    setError('');
    try {
      await validateProduct(product.blob);
    } catch (e) {
      setError(
        e instanceof ProviderError && e.code === 'product_size' ? t.preflight.product : t.preflight.product,
      );
      return;
    }
    abort.current = new AbortController();
    const working = createRun({
      brandName: brandName.trim(),
      brandColors: colors,
      brandDescription: brandDescription.trim(),
      productCategory: category.trim(),
      stylePreset,
    });
    setRun(working);
    setHero(null);
    setHeroAssets([]);
    setBusy(true);
    await persist(working);
    await execute(working, 'cutout');
  }

  async function retry() {
    if (!run || busy) return;
    const failed = run.steps.find((step) => step.status === 'failed')?.id;
    const from = failed ?? nextPendingStep(run);
    if (!from) return;
    abort.current = new AbortController();
    const working = resetFrom(run, from);
    setRun(working);
    setBusy(true);
    await persist(working);
    await execute(working, from);
  }

  async function viewPast(past: AutoRunRecord) {
    setRun(past);
    setError('');
    if (past.hero) {
      setHero(past.hero);
      await loadHeroAssets(past);
    } else {
      setHero(null);
      setHeroAssets([]);
    }
  }

  async function downloadHero() {
    if (!hero || !heroHandle.current) return;
    await document.fonts.ready;
    const url = heroHandle.current.exportPng();
    const link = document.createElement('a');
    link.href = url;
    link.download = `admorph-auto-${run?.id ?? 'hero'}.png`;
    link.click();
  }

  const headlineFont = hero?.layers.find((layer) => layer.kind === 'headline')?.fontFamily;
  return (
    <section className="feature-card" data-testid="auto-run-tool">
      <h2>{t.title}</h2>
      <p>{t.description}</p>
      <fieldset disabled={busy}>
        <label>
          {t.brandName}
          <input type="text" value={brandName} onChange={(event) => setBrandName(event.target.value)} />
        </label>
        <label>
          {t.brandDescription}
          <input
            type="text"
            value={brandDescription}
            onChange={(event) => setBrandDescription(event.target.value)}
          />
        </label>
        <label>
          {t.colors}
          <span style={{ display: 'flex', gap: 8 }}>
            {colors.map((color, index) => (
              <input
                key={index}
                aria-label={`${t.colors} ${index + 1}`}
                type="color"
                value={color}
                onChange={(event) => {
                  const next: [string, string, string] = [...colors];
                  next[index] = event.target.value;
                  setColors(next);
                }}
              />
            ))}
          </span>
        </label>
        <label>
          {t.category}
          <input type="text" value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>
        <label>
          {t.type}
          <select value={typeHint} onChange={(event) => setTypeHint(event.target.value as typeof typeHint)}>
            {(['can', 'bottle', 'box', 'cup', 'other'] as const).map((value) => (
              <option key={value} value={value}>
                {t.types[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.style}
          <select
            value={stylePreset}
            onChange={(event) => setStylePreset(event.target.value as BackgroundStyle)}
          >
            {(['hero', 'dynamic', 'minimal'] as const).map((value) => (
              <option key={value} value={value}>
                {t.styles[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.upload}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (product) URL.revokeObjectURL(product.url);
              setProduct({ blob: file, url: URL.createObjectURL(file) });
            }}
          />
        </label>
      </fieldset>
      {product && (
        <figure>
          <img src={product.url} alt={t.upload} style={{ maxWidth: 240, maxHeight: 240 }} />
        </figure>
      )}
      <label className="studio-consent">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>{t.consentLabel}</span>
      </label>
      <details>
        <summary>{t.consentTitle}</summary>
        <p>{t.consentText}</p>
      </details>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="button primary"
          disabled={busy || !consent || !product || !brandName.trim()}
          onClick={() => void start()}
        >
          {t.run}
        </button>
        {busy && (
          <button type="button" className="button secondary" onClick={() => abort.current?.abort()}>
            {t.cancel}
          </button>
        )}
        {run && (run.status === 'failed' || run.status === 'cancelled') && (
          <button type="button" className="button secondary" disabled={busy} onClick={() => void retry()}>
            {t.retry}
          </button>
        )}
        {hero && (
          <button type="button" className="button secondary" onClick={() => void downloadHero()}>
            {t.download}
          </button>
        )}
      </div>
      {error && (
        <p role="alert">{error}</p>
      )}
      {run && (
        <ol role="status">
          {run.steps.map((step) => (
            <li key={step.id}>
              {t.steps[step.id]}: {t.status[step.status]}
              {step.error ? ` — ${step.error}` : ''}
            </li>
          ))}
        </ol>
      )}
      {run && run.status === 'done' && hero && (
        <section>
          <h3>{t.hero}</h3>
          <p>{run.tagline}</p>
          <p>{run.caption}</p>
          <p>
            {t.dominantColors}: {run.dominantColors.join(', ') || '—'}
          </p>
          <p>
            {t.reviewCount}: {run.reviewCodes.join(', ') || '—'}
          </p>
          <DesignCanvas
            layers={hero.layers}
            assets={heroAssets}
            selected={null}
            select={() => {}}
            patch={() => {}}
            zoom={1}
            handle={heroHandle}
            ready
            onReady={() => {}}
            label={t.hero}
            rtl={headlineFont === 'Cairo'}
            disabled
          />
        </section>
      )}
      <section>
        <h3>{t.pastRuns}</h3>
        {pastRuns.length === 0 && <p>{t.emptyRuns}</p>}
        <ul>
          {pastRuns.map((past) => (
            <li key={past.id}>
              <button type="button" className="text-button" onClick={() => void viewPast(past)}>
                {past.brandName} — {new Date(past.createdAt).toLocaleString()} — {t.status[past.status]}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
