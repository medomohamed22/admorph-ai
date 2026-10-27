'use client';
import { useEffect, useRef, useState } from 'react';
import { useMessages } from './workspace';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import { validateProduct } from '@/lib/campaign/client';
import { cutoutImage } from '@/lib/cutout/provider';
import { getDatabase } from '@/lib/db/dexie';
import type { Asset } from '@/lib/db/schema';
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
import { buildResults, type AutoResult } from '@/lib/auto-run/results';
import {
  checkResultProvenance,
  isResultModified,
  qualityLabel,
  verifyProductPixels,
  type PixelCheck,
} from '@/lib/auto-run/integrity';
import { writeZip } from '@/lib/export/zip';
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
  const [results, setResults] = useState<AutoResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [captionDraft, setCaptionDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [pixelCheck, setPixelCheck] = useState<PixelCheck | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipNote, setZipNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const heroHandle = useRef<CanvasHandle | null>(null);
  const loadedRef = useRef<Set<string>>(new Set());

  const selected = results.find((result) => result.id === selectedId) ?? null;

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

  async function loadResultAssets(working: AutoRunRecord, result: AutoResult) {
    const db = getDatabase();
    const found: Asset[] = [];
    for (const id of [working.cutoutAssetId, result.backgroundAssetId]) {
      if (!id) continue;
      const asset = await db.assets.get(id);
      if (asset) found.push(asset);
    }
    setSelectedAssets(found);
  }

  useEffect(() => {
    if (!run || !selected || !run.productAssetId || !run.cutoutAssetId) {
      return;
    }
    let alive = true;
    (async () => {
      const db = getDatabase();
      const productAsset = await db.assets.get(run.productAssetId!);
      const cutoutAsset = await db.assets.get(run.cutoutAssetId!);
      if (!alive || !productAsset || !cutoutAsset) return;
      try {
        const original = await blobToImageData(productAsset.blob);
        const cutout = await blobToImageData(cutoutAsset.blob);
        if (!alive) return;
        setPixelCheck(verifyProductPixels(original, cutout));
      } catch {
        if (alive) setPixelCheck(null);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [run, selected]);

  function resetLoaded() {
    loadedRef.current = new Set();
    setLoadedIds(new Set());
  }

  async function selectResult(working: AutoRunRecord, result: AutoResult) {
    setSelectedId(result.id);
    setCaptionDraft(result.caption);
    setCopied(false);
    setPixelCheck(null);
    resetLoaded();
    await loadResultAssets(working, result);
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
          const hero = {
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
      if (working.hero && working.cutoutAssetId && working.backgroundAssetId) {
        working = {
          ...working,
          results: buildResults({
            brandName: working.brandName,
            brandColors: working.brandColors,
            brandDescription: working.brandDescription,
            productCategory: working.productCategory || 'product',
            stylePreset: working.stylePreset,
            hero: working.hero,
            tagline: working.tagline,
            caption: working.caption,
            cta: t.ctaDefault,
            cutoutAssetId: working.cutoutAssetId,
            backgroundAssetId: working.backgroundAssetId,
            sceneMood: working.brief?.sceneMood ?? 'fresh, premium',
          }),
        };
      }
      working = finishRun(working, 'done');
      setRun(working);
      await persist(working);
      if (working.results.length > 0) {
        setResults(working.results);
        await selectResult(working, working.results[0]);
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
    } catch {
      setError(t.preflight.product);
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
    setResults([]);
    setSelectedId(null);
    setSelectedAssets([]);
    setPixelCheck(null);
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
    setResults([]);
    setSelectedId(null);
    setSelectedAssets([]);
    setPixelCheck(null);
    setBusy(true);
    await persist(working);
    await execute(working, from);
  }

  async function viewPast(past: AutoRunRecord) {
    setRun(past);
    setError('');
    const pastResults =
      past.results.length > 0
        ? past.results
        : past.hero && past.backgroundAssetId
          ? [
              {
                id: crypto.randomUUID(),
                preset: past.stylePreset,
                tagline: past.tagline,
                caption: past.caption,
                hero: past.hero,
                backgroundAssetId: past.backgroundAssetId,
                backgroundVariant: 0,
              } satisfies AutoResult,
            ]
          : [];
    setResults(pastResults);
    if (pastResults.length > 0) {
      await selectResult(past, pastResults[0]);
    } else {
      setSelectedId(null);
      setSelectedAssets([]);
      setPixelCheck(null);
    }
  }

  function heroReady(result: AutoResult | null): boolean {
    if (!result) return false;
    return result.hero.layers
      .filter((layer) => layer.visible && layer.assetId)
      .every((layer) => loadedIds.has(layer.assetId!));
  }

  async function commitCaption(value: string) {
    if (!run || !selected) return;
    const caption = value.slice(0, 1200);
    const nextResults = results.map((result) =>
      result.id === selected.id
        ? { ...result, caption, hero: { ...result.hero, caption } }
        : result,
    );
    const working: AutoRunRecord = { ...run, results: nextResults };
    setResults(nextResults);
    setRun(working);
    await persist(working);
  }

  async function applyCaptionToAll() {
    if (!run || !selected) return;
    const caption = captionDraft.slice(0, 1200);
    const nextResults = results.map((result) => ({
      ...result,
      caption,
      hero: { ...result.hero, caption },
    }));
    const working: AutoRunRecord = { ...run, results: nextResults };
    setResults(nextResults);
    setRun(working);
    await persist(working);
  }

  async function copyCaption() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(captionDraft);
      setCopied(true);
    } catch {
      setError(t.errors.failed);
    }
  }

  function downloadTextFile(name: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function regenerateBackground() {
    if (!run || !selected) return;
    const variant = (selected.backgroundVariant + 1) % 3;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    paintLocalBackground(canvas.getContext('2d')!, run.brandColors, variant);
    const blob = await canvasToBlob(canvas);
    const asset: Asset = {
      id: crypto.randomUUID(),
      kind: 'background',
      blob,
      createdAt: new Date().toISOString(),
    };
    await getDatabase().assets.put(asset);
    const nextResults = results.map((result) =>
      result.id === selected.id
        ? {
            ...result,
            backgroundAssetId: asset.id,
            backgroundVariant: variant,
            hero: {
              ...result.hero,
              layers: result.hero.layers.map((layer) =>
                layer.kind === 'background' ? { ...layer, assetId: asset.id } : layer,
              ),
            },
          }
        : result,
    );
    const working: AutoRunRecord = { ...run, results: nextResults };
    setResults(nextResults);
    setRun(working);
    await persist(working);
    const updated = nextResults.find((result) => result.id === selected.id)!;
    await selectResult(working, updated);
  }

  async function downloadSelectedPng() {
    if (!selected || !heroHandle.current) return;
    await document.fonts.ready;
    const url = heroHandle.current.exportPng();
    const link = document.createElement('a');
    link.href = url;
    link.download = `admorph-auto-${selected.id}.png`;
    link.click();
  }

  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1] ?? '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function downloadZip() {
    if (!run || results.length === 0 || zipBusy) return;
    setZipBusy(true);
    setZipNote('');
    setError('');
    const encoder = new TextEncoder();
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    let skipped = 0;
    try {
      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        entries.push({ name: `ad-${index + 1}-caption.txt`, data: encoder.encode(result.caption) });
        if (selectedId !== result.id) {
          await selectResult(run, result);
        }
        let png: Uint8Array | null = null;
        for (let attempt = 0; attempt < 50; attempt++) {
          const needed = result.hero.layers
            .filter((layer) => layer.visible && layer.assetId)
            .map((layer) => layer.assetId!);
          if (needed.every((id) => loadedRef.current.has(id)) && heroHandle.current) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        try {
          await document.fonts.ready;
          if (heroHandle.current) png = dataUrlToBytes(heroHandle.current.exportPng());
        } catch {
          png = null;
        }
        if (png) entries.push({ name: `ad-${index + 1}.png`, data: png });
        else skipped++;
      }
      const bytes = writeZip(entries);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'admorph-auto-set.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (skipped > 0) setZipNote(t.zipSkipped);
    } catch {
      setError(t.errors.failed);
    } finally {
      setZipBusy(false);
    }
  }

  const headlineFont = selected?.hero.layers.find((layer) => layer.kind === 'headline')?.fontFamily;
  const provenanceIssues =
    run && selected
      ? checkResultProvenance(
          run,
          selected,
          new Map(
            selectedAssets.map((asset) => [
              asset.id,
              {
                kind: asset.kind,
                derivedFrom: asset.meta?.derivedFrom,
                provider: asset.meta?.provider,
              },
            ]),
          ),
        )
      : [];
  const templateCaption =
    run != null
      ? buildAutoCopy(run.brandName, run.productCategory || 'product', run.brandDescription).caption
      : '';
  const label =
    selected != null
      ? qualityLabel(pixelCheck, provenanceIssues, isResultModified(selected, templateCaption))
      : 'not_checked';
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
      </div>
      {error && <p role="alert">{error}</p>}
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
      {run && run.status === 'done' && (
        <p>
          {t.dominantColors}: {run.dominantColors.join(', ') || '—'} · {t.reviewCount}:{' '}
          {run.reviewCodes.join(', ') || '—'}
        </p>
      )}
      {results.length > 0 && selected && (
        <section>
          <h3>{t.results}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                className="button secondary"
                aria-pressed={result.id === selected.id}
                disabled={zipBusy}
                onClick={() => run && void selectResult(run, result)}
              >
                {index === 0 ? t.hero : `${t.variant} ${index}`} — {t.styles[result.preset]} —{' '}
                {result.tagline}
              </button>
            ))}
          </div>
          <p>{selected.tagline}</p>
          <label htmlFor="auto-run-caption">{t.caption}</label>
          <textarea
            id="auto-run-caption"
            maxLength={1200}
            value={captionDraft}
            onChange={(event) => setCaptionDraft(event.target.value)}
            onBlur={() => void commitCaption(captionDraft)}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button secondary" onClick={() => void copyCaption()}>
              {copied ? t.copied : t.copyCaption}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                downloadTextFile(`ad-caption-${selected.id.slice(0, 8)}.txt`, captionDraft)
              }
            >
              {t.downloadCaption}
            </button>
            <button type="button" className="button secondary" onClick={() => void applyCaptionToAll()}>
              {t.applyCaptionToAll}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={zipBusy}
              onClick={() => void regenerateBackground()}
            >
              {t.regenerateBackground}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!heroReady(selected)}
              onClick={() => void downloadSelectedPng()}
            >
              {t.download}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={zipBusy}
              onClick={() => void downloadZip()}
            >
              {t.downloadZip}
            </button>
          </div>
          {zipNote && <p role="status">{zipNote}</p>}
          <section>
            <h4>
              {t.quality}: {t.qualityLabels[label === 'not_checked' ? 'notChecked' : label]}
            </h4>
            <ul>
              <li>
                {t.qualityChecks.productPixels}:{' '}
                {pixelCheck == null
                  ? t.qualityLabels.notChecked
                  : pixelCheck.preserved
                    ? t.qualityLabels.verified
                    : `${t.qualityLabels.warning} (${pixelCheck.mismatchedPixels}/${pixelCheck.totalPixels})`}
              </li>
              <li>
                {t.qualityChecks.provenance}:{' '}
                {provenanceIssues.length === 0
                  ? t.qualityLabels.verified
                  : `${t.qualityLabels.warning}: ${provenanceIssues.join(', ')}`}
              </li>
              <li>
                {t.qualityChecks.text}:{' '}
                {provenanceIssues.includes('text_box')
                  ? t.qualityLabels.warning
                  : t.qualityLabels.verified}
              </li>
              <li>
                {t.qualityChecks.caption}:{' '}
                {provenanceIssues.includes('caption_length')
                  ? t.qualityLabels.warning
                  : t.qualityLabels.verified}
              </li>
            </ul>
          </section>
          <DesignCanvas
            layers={selected.hero.layers}
            assets={selectedAssets}
            selected={null}
            select={() => {}}
            patch={() => {}}
            zoom={1}
            handle={heroHandle}
            ready={heroReady(selected)}
            onReady={(id) => {
              loadedRef.current = new Set(loadedRef.current).add(id);
              setLoadedIds(loadedRef.current);
            }}
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
