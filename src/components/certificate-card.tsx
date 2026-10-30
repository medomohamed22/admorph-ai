'use client';
import { useState, type CSSProperties } from 'react';
import { useMessages } from './workspace';
import { ScoreRing, ModelBadge } from './ui';
import { IconCheck } from './ui/icons';
import { META_MODELS } from '@/lib/ai/models';
import { sha256Hex, deterministicChecksFor } from '@/lib/evidence/manifest';
import type { OneshotCanvasElement, VerifyResult } from '@/lib/ai/oneshot';

type Row = { key: string; label: string; ok: boolean | null; note: string };

/**
 * The fidelity certificate: a score ring that fills while the number counts
 * up, then the four checks (product, logo, layout, text) tick in one after
 * another. The score is a model judgment and is labelled as one.
 */
export function CertificateCard({ certificate, score, hasLogo }: { certificate: VerifyResult; score: number; hasLogo: boolean }) {
  const t = useMessages().oneshot;
  const textsOk = certificate.texts.every(item => item.match);
  const rows: Row[] = [
    { key: 'product', label: t.productKept, ok: certificate.productKept, note: certificate.productNote },
    { key: 'logo', label: t.logoKept, ok: hasLogo ? certificate.logoKept : null, note: hasLogo ? certificate.logoNote : t.certNoLogo },
    { key: 'layout', label: t.layoutKept, ok: certificate.layoutKept, note: certificate.layoutNote },
    ...(certificate.extraText !== undefined ? [{ key: 'extra', label: t.certExtra, ok: certificate.extraText.length === 0, note: certificate.extraText.length ? t.certExtraFound.replace('{list}', certificate.extraText.map(item => `“${item}”`).join(', ')) : t.certExtraNone }] : []),
    { key: 'text', label: t.certText, ok: certificate.texts.length ? textsOk : null, note: certificate.texts.length ? certificate.texts.map(item => item.match ? `“${item.expected}” ✓` : `“${item.expected}” → “${item.found}”`).join(' · ') : t.certNoText },
  ];
  return <div className="cert-card" data-testid="oneshot-certificate">
    <div className="cert-head">
      <ScoreRing value={score} size={128} label={t.certificate} />
      <div>
        <h3>{t.certificate}</h3>
        <p className="cert-score-line">{t.score}: {score}</p>
        <p className="cert-judgment">{t.certJudgment}</p>
      </div>
    </div>
    <ul className="cert-checks">
      {rows.map((row, index) => <li key={row.key} className={row.ok === null ? 'is-na' : row.ok ? 'is-ok' : 'is-bad'} style={{ '--i': index } as CSSProperties} data-testid={`cert-${row.key}`}>
        <span className="cert-mark" aria-hidden="true">{row.ok === null ? '–' : row.ok ? <IconCheck size={14} /> : '✗'}</span>
        <span><strong>{row.label}</strong>{row.note ? <small>{row.note}</small> : null}</span>
        <span className="visually-hidden">{row.ok === null ? t.certNotApplicable : row.ok ? '✓' : '✗'}</span>
      </li>)}
    </ul>
  </div>;
}

/**
 * "Why trust this ad?": the evidence behind the result, on screen — the
 * exact model IDs, SHA-256 hashes of the original photo, the product used
 * and the final image, and the deterministic checks on the layout that was
 * painted. Hashes are computed on open, locally; nothing is sent anywhere.
 */
export function TrustPanel({ original, productSource, result, layout, certificateValid, frameHeight = 1350, disabled = false }: { original: Blob; productSource: Blob; result: Blob; layout: OneshotCanvasElement[]; certificateValid: boolean; frameHeight?: number; disabled?: boolean }) {
  const t = useMessages().oneshot;
  const [open, setOpen] = useState(false);
  const [hashes, setHashes] = useState<{ original: string; product: string; final: string } | null>(null);
  async function toggle() {
    const next = !open; setOpen(next);
    if (next && !hashes) {
      const [a, b, c] = await Promise.all([sha256Hex(original), sha256Hex(productSource), sha256Hex(result)]);
      setHashes({ original: a, product: b, final: c });
    }
  }
  const checks = deterministicChecksFor(layout, frameHeight);
  const checkLabel: Record<string, string> = { overlap_product: t.findingOverlapProduct, overlap_text: t.findingOverlapText, overlap_logo: t.findingOverlapLogo, low_contrast: t.findingLowContrast, outside_safe_zone: t.findingSafeZone };
  return <div className="trust">
    <button type="button" className="ui-btn ui-btn--ghost" aria-expanded={open} aria-controls="trust-panel" disabled={disabled} onClick={() => void toggle()}>{t.trustTitle}</button>
    {open && !disabled && <section id="trust-panel" className="trust-panel" data-testid="trust-panel" aria-label={t.trustTitle}>
      <p>{t.trustLead}</p>
      <h4>{t.trustModels}</h4>
      <ul className="trust-models">
        {(['sam', 'spark', 'image'] as const).map(key => <li key={key}><ModelBadge model={key} chip /><code dir="ltr">{META_MODELS[key].id}</code></li>)}
      </ul>
      <h4>{t.trustHashes}</h4>
      {hashes ? <dl className="trust-hashes" dir="ltr">
        <dt>{t.trustOriginal}</dt><dd><code>{hashes.original}</code></dd>
        <dt>{t.trustProduct}</dt><dd><code>{hashes.product}</code></dd>
        <dt>{t.trustFinal}</dt><dd><code data-testid="trust-final-hash">{hashes.final}</code></dd>
      </dl> : <p>{t.trustHashing}</p>}
      <h4>{t.trustChecks}</h4>
      <ul className="trust-checks">
        {checks.map(check => <li key={check.code} className={check.status === 'pass' ? 'is-ok' : 'is-bad'}>{check.status === 'pass' ? '✓' : '✗'} {checkLabel[check.code] ?? check.code}</li>)}
      </ul>
      <p className="trust-status">{certificateValid ? t.trustCertValid : t.trustCertCleared}</p>
    </section>}
  </div>;
}
