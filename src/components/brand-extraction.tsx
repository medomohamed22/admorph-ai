'use client';
import { ModelBadge } from './ui';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { extractedSchema, type extractRequest } from '@/lib/ai/meta-contracts';
import { z } from 'zod';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { validateProduct } from '@/lib/campaign/client';
import { sampleColors, type ColorSample } from '@/lib/brand/sample-colors';

export type BrandSuggestion = z.infer<typeof extractedSchema>;


/**
 * Reverse brand kit: one photo of a logo, a package or a storefront in,
 * an editable identity out. While Muse Spark reads the photo, a scan line
 * passes over it and the colors measured on this device appear as dots on
 * the photo; the button counts the seconds. Nothing here pretends to be
 * model progress: the dots are local measurements, labelled as such.
 */
export function BrandExtraction({ onAccept }: { onAccept: (suggestion: BrandSuggestion) => void }) {
  const t = useMessages().meta, provider = useProviderSession(), { locale } = useWorkspace();
  const [image, setImage] = useState<z.infer<typeof extractRequest>['image'] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [samples, setSamples] = useState<ColorSample[]>([]);
  const [suggestion, setSuggestion] = useState<BrandSuggestion | null>(null);
  const [sample, setSample] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [took, setTook] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), [provider.keyEpoch]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // The button's seconds counter: set at the start of a request, ticked every 100 ms while it runs.
  const [clock, setClock] = useState({ start: 0, now: 0 });
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setClock(previous => ({ ...previous, now: performance.now() })), 100);
    return () => clearInterval(timer);
  }, [busy]);
  const elapsed = Math.max(0, (clock.now - clock.start) / 1000);
  const modelId = provider.taskModel('vision').modelId, key = provider.configs.meta.apiKey.trim(), model = modelId ? { modelId } : null;
  const seconds = (value: number) => value.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  async function checkLocally() {
    if (!image || !model || !key) return;
    setBusy(true); setError(''); setDiagnostic('');
    try {
      const response = await fetch('/api/ai/brand-extract/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: model.modelId, apiKey: key, consent: true, imageConsent: true, image }) });
      await requireMetaSuccess(response);
      const result = z.object({ status: z.literal('valid'), modelId: z.string(), imageType: z.string(), imageBytes: z.number(), metaRequests: z.literal(0) }).parse(await response.json());
      setDiagnostic(`${t.localCheckPassed} · ${result.modelId} · ${result.imageType} · ${result.imageBytes} bytes`);
    } catch (cause) { setError(metaErrorMessage(cause, t)); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    abort.current?.abort();
    setImage(null); setSuggestion(null); setConsent(false); setError(''); setSamples([]); setTook(null);
    try {
      await validateProduct(file);
      const bitmap = await createImageBitmap(file), scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      setSamples(sampleColors(context.getImageData(0, 0, canvas.width, canvas.height)));
      setImage({ mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', .85).split(',')[1] });
      setPreview(URL.createObjectURL(file));
    } catch { setError(t.imageError); }
  }

  async function run() {
    if (!image || !model || !consent || !key) return;
    const started = performance.now();
    setClock({ start: started, now: started });
    setBusy(true); setError(''); setSuggestion(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await metaFetch('vision', '/api/ai/brand-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: model.modelId, apiKey: provider.configs.meta.apiKey, consent: true, imageConsent: true, image }), signal: controller.signal });
      await requireMetaSuccess(response);
      const result = extractedSchema.parse(await response.json());
      if (!controller.signal.aborted) { setSuggestion(result); setSample(false); setTook((performance.now() - started) / 1000); }
    } catch (cause) { setError(metaErrorMessage(cause, t)); }
    finally { setBusy(false); setConsent(false); }
  }

  function demo() {
    setSample(true); setTook(null);
    setSuggestion({ suggestedName: 'Sora', primaryHex: '#52633c', secondaryHex: '#dce5bb', accentHex: '#f2d1bc', brandTone: 'Calm', shortDescriptionEn: 'Local sample: a calm daily matcha ritual.', shortDescriptionAr: 'عينة محلية: طقس يومي هادئ للماتشا.', recommendedFontEn: 'Inter', recommendedFontAr: 'Cairo', rationale: t.sampleReason, wordmarkStyle: 'Calm rounded sans', wordmarkBold: false });
  }

  const swatches = suggestion ? [suggestion.primaryHex, suggestion.secondaryHex, suggestion.accentHex] : [];
  return <section className="feature-card brand-extract" data-testid="brand-extraction" aria-busy={busy}>
    <header className="brand-extract-head">
      <h2>{t.reverseBrand}</h2>
      <ModelBadge model="spark" chip />
    </header>
    <p className="brand-extract-lead">{t.extractLead}</p>

    <div className={`brand-extract-drop${preview ? ' has-image' : ''}${busy ? ' is-busy' : ''}`}>
      <input aria-label={t.extractImage} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      {preview
        ? <div className="brand-extract-stage">
            {/* The frame is exactly the image's size, so the measured color dots land on the photo itself. */}
            <div className="brand-extract-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" />
              {busy && <div className="brand-extract-scan" aria-hidden="true"><span className="beam" /><span className="grid" /></div>}
              {samples.map((dot, index) => <i key={`${dot.hex}-${index}`} className="brand-extract-dot" aria-hidden="true" style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%`, background: dot.hex, '--i': index } as CSSProperties} />)}
            </div>
          </div>
        : <div className="brand-extract-empty" aria-hidden="true">
            <span className="brand-extract-icon">◎</span>
            <strong>{t.extractDrop}</strong>
            <small>{t.extractDropHint}</small>
          </div>}
      {preview && !busy && <span className="brand-extract-change" aria-hidden="true">{t.extractChange}</span>}
    </div>

    {samples.length > 0 && <div className="brand-extract-measured">
      <small>{t.extractMeasured}</small>
      <span className="brand-extract-chips">{samples.map(dot => <i key={dot.hex} style={{ background: dot.hex }} title={dot.hex} />)}</span>
    </div>}

    {busy && <div className="brand-extract-reading" role="status" data-testid="brand-extract-reading">
      <strong>{t.extractReading}</strong>
      <ul>{[t.extractPartName, t.extractPartColors, t.extractPartTone, t.extractPartFont].map((part, index) => <li key={part} style={{ '--i': index } as CSSProperties}><span className="shimmer" />{part}</li>)}</ul>
    </div>}

    {!key && <p className="brand-extract-note">{t.errors.missing_key}</p>}
    <label className="check-label brand-extract-consent"><input type="checkbox" checked={consent} disabled={!image || busy} onChange={event => setConsent(event.target.checked)} />{t.shareImage}</label>
    <div className="brand-extract-actions">
      <button type="button" className={`button primary brand-extract-go${busy ? ' is-busy' : ''}`} disabled={!model || !key || !image || !consent || busy} onClick={() => void run()}>
        {busy ? <><span className="brand-extract-spinner" aria-hidden="true" />{t.extractBusy.replace('{s}', seconds(elapsed))}</> : t.extract}
      </button>
      <button type="button" className="text-button" onClick={demo} disabled={busy}>{t.samplePackaging}</button>
    </div>
    <p className="brand-extract-fine">{t.visionRequirement}</p>
    <button type="button" className="text-button brand-extract-fine" disabled={!image || !model || !key || busy} onClick={() => void checkLocally()}>{t.localCheck}</button>
    {diagnostic && <p role="status" data-testid="local-request-check">{diagnostic}</p>}

    {suggestion && <article className="brand-extract-result" data-testid="brand-suggestion">
      <span className={`brand-extract-tag${sample ? ' is-sample' : ''}`}>{sample ? t.sample : t.metaSuggestion}</span>
      <h3>{suggestion.suggestedName}</h3>
      {took !== null && <small className="brand-extract-took">{t.extractTook.replace('{s}', seconds(took))}</small>}
      <div className="brand-extract-swatches">{swatches.map((color, index) => <span key={`${color}-${index}`} style={{ '--i': index } as CSSProperties}><i style={{ background: color }} /><code dir="ltr">{color.toUpperCase()}</code></span>)}</div>
      <p className="brand-extract-desc">{locale === 'ar' ? suggestion.shortDescriptionAr : suggestion.shortDescriptionEn}</p>
      <dl className="brand-extract-facts">
        {suggestion.brandTone && <><dt>{t.extractTone}</dt><dd>{suggestion.brandTone}</dd></>}
        {suggestion.wordmarkStyle && <><dt>{t.wordmark}</dt><dd>{suggestion.wordmarkStyle} · {suggestion.wordmarkBold ? t.wordmarkBold : t.wordmarkRegular}</dd></>}
      </dl>
      <p className="brand-extract-why">{suggestion.rationale}</p>
      <button type="button" className="button primary" onClick={() => onAccept(suggestion)}>{t.useSuggestion}</button>
    </article>}
    {error && <p role="alert" className="brand-extract-error">{error}</p>}
  </section>;
}
