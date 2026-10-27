'use client';
import { useRef, useState } from 'react';
import { useMessages } from './workspace';
import { validateProduct } from '@/lib/campaign/client';
import { ProviderError } from '@/lib/ai/errors';
import { cutoutImage, type CutoutResult } from '@/lib/cutout/provider';
import { getDatabase } from '@/lib/db/dexie';

const checkerboard = {
  backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)',
  backgroundSize: '16px 16px',
} as const;

/**
 * Standalone cutout tool (unlinked route, not the landing default).
 * Local-only: no image leaves the browser, no Meta call is made.
 */
export function CutoutTool() {
  const m = useMessages();
  const t = m.cutout;
  const [original, setOriginal] = useState<{ blob: Blob; url: string } | null>(null);
  const [cutout, setCutout] = useState<{ result: CutoutResult; url: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'cutting' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const abort = useRef<AbortController | null>(null);

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

  async function run() {
    if (!original || status === 'cutting') return;
    setStatus('cutting');
    setError('');
    setSaved(false);
    try {
      const result = await cutoutImage(original.blob, 'local');
      if (cutout) URL.revokeObjectURL(cutout.url);
      setCutout({ result, url: URL.createObjectURL(result.cutoutBlob) });
      setStatus('done');
    } catch {
      setStatus('error');
      setError(t.cutoutFailed);
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
          provider: 'local',
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
      <p>{t.description}</p>
      <p>{t.providerLocal}</p>
      <p>{t.providerUnavailable}</p>
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
