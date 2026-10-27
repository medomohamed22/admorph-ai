'use client';
import { useRef, useState } from 'react';
import { useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { validateProduct } from '@/lib/campaign/client';
import { ProviderError } from '@/lib/ai/errors';
import { cutoutImage, type CutoutProviderId, type CutoutResult } from '@/lib/cutout/provider';
import { getDatabase } from '@/lib/db/dexie';

const checkerboard = {
  backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '16px 16px',
} as const;

/**
 * Standalone cutout tool (unlinked route, not the landing default).
 * Local runs entirely in the browser; SAM sends the product photo to Meta
 * through the app's own /api/ai/segment route (BYOK, explicit provider
 * choice) and never touches product pixels. SAM failure never falls back
 * silently: the error stays visible with an explicit local-fallback button.
 */
export function CutoutTool() {
  const m = useMessages();
  const t = m.cutout;
  const provider = useProviderSession();
  const [original, setOriginal] = useState<{ blob: Blob; url: string } | null>(null);
  const [cutout, setCutout] = useState<{ result: CutoutResult; url: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'cutting' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [cutoutProvider, setCutoutProvider] = useState<CutoutProviderId>('local');
  const [samFailed, setSamFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const key = provider.configs.meta.apiKey.trim();
  const segmentModel = provider.taskModel('segment')?.modelId ?? '';
  const samReady = !!key && !!segmentModel;

  async function upload(file: File) {
    abort.current?.abort();
    setError('');
    setSaved(false);
    setCutout(null);
    setStatus('idle');
    try {
      await validateProduct(file);
    } catch (e) {
      setStatus('error');
      setError(e instanceof ProviderError && e.code === 'product_size' ? t.tooLarge : t.invalidFile);
      return;
    }
    if (original) URL.revokeObjectURL(original.url);
    setOriginal({ blob: file, url: URL.createObjectURL(file) });
  }

  async function run(useProvider: CutoutProviderId = cutoutProvider) {
    if (!original || status === 'cutting') return;
    setStatus('cutting');
    setError('');
    setSaved(false);
    setSamFailed(false);
    try {
      const result = useProvider === 'meta-sam'
        ? await cutoutImage(original.blob, 'meta-sam', { apiKey: key, modelId: segmentModel, prompt: 'product' })
        : await cutoutImage(original.blob, 'local');
      if (cutout) URL.revokeObjectURL(cutout.url);
      setCutout({ result, url: URL.createObjectURL(result.cutoutBlob) });
      setStatus('done');
    } catch (cause) {
      setStatus('error');
      if (useProvider === 'meta-sam') {
        setSamFailed(true);
        setError(cause instanceof Error && cause.message === 'segment_empty' ? t.samEmpty : t.samFailed);
      } else {
        setError(t.cutoutFailed);
      }
    }
  }

  async function save() {
    if (!cutout) return;
    try {
      await getDatabase().assets.put({
        id: crypto.randomUUID(),
        kind: 'cutout',
        blob: cutout.result.cutoutBlob,
        createdAt: new Date().toISOString(),
        meta: {
          provider: cutout.result.provider,
          sourceWidth: cutout.result.sourceWidth,
          sourceHeight: cutout.result.sourceHeight,
          reliable: cutout.result.reliable,
        },
      });
      setSaved(true);
    } catch {
      setError(t.saveFailed);
    }
  }

  return (
    <section className="feature-card" data-testid="cutout-tool">
      <h2>{t.title}</h2>
      <p>{cutoutProvider === 'meta-sam' ? t.descriptionSam : t.description}</p>
      <fieldset>
        <label><input type="radio" name="cutout-provider" checked={cutoutProvider === 'local'} onChange={() => setCutoutProvider('local')} />{t.providerLocal}</label>
        <label><input type="radio" name="cutout-provider" checked={cutoutProvider === 'meta-sam'} disabled={!samReady} onChange={() => setCutoutProvider('meta-sam')} />{t.providerSam}</label>
      </fieldset>
      {cutoutProvider === 'meta-sam' && !samReady && <p role="status">{t.providerUnavailable}</p>}
      {samFailed && <p><button type="button" className="button secondary" disabled={!original || status === 'cutting'} onClick={() => void run('local')}>{t.useLocalInstead}</button></p>}
      <input
        aria-label={t.upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {!original && <p>{t.noImage}</p>}
      {original && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <figure>
            <figcaption>{t.originalLabel}</figcaption>
            <img src={original.url} alt={t.originalLabel} style={{ maxWidth: 320, maxHeight: 320 }} />
          </figure>
          {cutout && (
            <figure>
              <figcaption>{t.cutoutLabel}</figcaption>
              <div style={{ ...checkerboard, display: 'inline-block' }}>
                <img src={cutout.url} alt={t.cutoutLabel} style={{ maxWidth: 320, maxHeight: 320, display: 'block' }} />
              </div>
            </figure>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="button primary" disabled={!original || status === 'cutting'} onClick={() => void run()}>
          {status === 'cutting' ? t.cutting : cutout ? t.retry : t.cut}
        </button>
        {cutout && (
          <>
            <button type="button" className="button secondary" onClick={() => void save()}>
              {t.save}
            </button>
            <a className="button secondary" href={cutout.url} download="cutout.png">
              {t.download}
            </a>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (cutout) URL.revokeObjectURL(cutout.url);
                setCutout(null);
                setStatus('idle');
              }}
            >
              {t.useOriginal}
            </button>
          </>
        )}
      </div>
      {status === 'done' && cutout && (
        <p role="status">
          {cutout.result.reliable ? t.reliable : t.unreliable}
          {cutout.result.warnings.map((w) => (
            <span key={w}> {t.warnings[w]}</span>
          ))}
        </p>
      )}
      {saved && <p role="status">{t.saved}</p>}
      {status === 'error' && error && (
        <p role="alert">{error}</p>
      )}
    </section>
  );
}
