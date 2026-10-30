'use client';
import { useEffect, useState } from 'react';
import { useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { useObjectUrl } from './logo';
import { WaitingText } from './waiting';
import { metaFetch } from '@/lib/ai/meta-fetch';
import { requireMetaSuccess, metaErrorMessage } from '@/lib/ai/meta-client-error';
import { encodeProduct, fitProductImage, validateGeneratedImage } from '@/lib/campaign/client';
import { oneshotScore, verifyResultSchema, RESIZE_FORMATS, type OneshotElement, type ResizeFormat } from '@/lib/ai/oneshot';
import { composeFrame, fitToFormat } from '@/lib/oneshot/reframe';
import { saveAd } from '@/lib/db/repository';
import type { BrandInput } from '@/lib/db/schema';

type SizeState = { local: Blob | null; ai: Blob | null; exact: boolean; score: number | null; busy: boolean; error: string };
const EMPTY: SizeState = { local: null, ai: null, exact: true, score: null, busy: false, error: '' };

/**
 * One ad, three sizes. 1:1 and 9:16 are framed on the device at once (no
 * request); "Extend the scene" asks Muse Image to fill the bands and the
 * critic to check the words survived, so each AI size carries its own score.
 */
export function SizeSet({ ad, layout, brand, language, hasLogo, cutout }: { ad: Blob; layout: OneshotElement[]; brand: BrandInput; language: 'en' | 'ar'; hasLogo: boolean; cutout?: Blob | null }) {
  const t = useMessages().oneshot, m = useMessages(), provider = useProviderSession();
  const [sizes, setSizes] = useState<Record<ResizeFormat, SizeState>>({ '1080x1080': EMPTY, '1080x1920': EMPTY });
  const imageModel = provider.taskModel('image_edit') ?? provider.taskModel('image');
  const verifyModel = provider.taskModel('vision') ?? provider.taskModel('critic');
  const key = provider.configs.meta.apiKey.trim();
  const errorText = { errors: m.settings.errors, aiError: m.meta.aiError };
  const patch = (format: ResizeFormat, values: Partial<SizeState>) => setSizes(previous => ({ ...previous, [format]: { ...previous[format], ...values } }));

  useEffect(() => {
    let alive = true;
    for (const format of RESIZE_FORMATS) composeFrame(ad, format).then(local => { if (alive) patch(format, { local }); }).catch(() => {});
    return () => { alive = false; };
  }, [ad]);

  async function extend(format: ResizeFormat) {
    const local = sizes[format].local;
    if (!local || !imageModel || !key || sizes[format].busy) return;
    patch(format, { busy: true, error: '' });
    try {
      const words = layout.filter(element => (element.kind === 'text' || element.kind === 'phone') && element.text?.trim()).map(element => element.text!.trim()).slice(0, 8);
      const response = await metaFetch('image_edit', '/api/ai/oneshot-resize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: imageModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(await fitProductImage(local)), format, words, language }), signal: AbortSignal.timeout(65000) });
      await requireMetaSuccess(response);
      const painted = await response.blob(); await validateGeneratedImage(painted);
      const fitted = await fitToFormat(painted, format);
      let score: number | null = null;
      if (verifyModel) {
        const verify = await metaFetch('vision', '/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: verifyModel.modelId, apiKey: key, consent: true, imageConsent: true, image: await encodeProduct(await fitProductImage(fitted.blob)), layout, language }), signal: AbortSignal.timeout(65000) });
        await requireMetaSuccess(verify);
        score = oneshotScore(verifyResultSchema.parse(await verify.json()), hasLogo);
      }
      patch(format, { ai: fitted.blob, exact: fitted.exact, score, busy: false });
      void saveAd({ id: crypto.randomUUID(), blob: fitted.blob, source: 'oneshot', brand, headline: layout.find(element => element.kind === 'text')?.text ?? '', hasLogo, createdAt: new Date().toISOString(), format, ...(cutout ? { cutout } : {}) }).catch(() => {});
    } catch (cause) { patch(format, { busy: false, error: metaErrorMessage(cause, errorText) }); }
  }

  const label: Record<ResizeFormat | '1080x1350', string> = { '1080x1350': t.sizeFeed, '1080x1080': t.sizeSquare, '1080x1920': t.sizeStory };
  return <section className="size-set" data-testid="size-set" aria-labelledby="size-set-title">
    <h3 id="size-set-title">{t.sizesTitle}</h3>
    <p className="size-lead">{t.sizesLead}</p>
    <div className="size-grid">
      <SizeTile format="1080x1350" blob={ad} label={label['1080x1350']} downloadLabel={t.sizeDownload} />
      {RESIZE_FORMATS.map(format => {
        const state = sizes[format];
        const badge = state.ai ? (state.exact ? t.sizeAi : t.sizeAiReframed) + (state.score !== null ? ` · ${t.score} ${state.score}` : '') : state.local ? t.sizeLocal : undefined;
        return <SizeTile key={format} format={format} blob={state.ai ?? state.local} label={label[format]} badge={badge} downloadLabel={t.sizeDownload}>
          {!state.ai && <button type="button" className="button secondary" disabled={!state.local || !imageModel || !key || state.busy} onClick={() => void extend(format)}>{state.busy ? <WaitingText label={t.sizeExtending} /> : t.sizeExtend}</button>}
          {state.error && <p className="size-error" role="alert">{state.error}</p>}
        </SizeTile>;
      })}
    </div>
  </section>;
}

function SizeTile({ format, blob, label, badge, downloadLabel, children }: { format: string; blob: Blob | null; label: string; badge?: string; downloadLabel: string; children?: React.ReactNode }) {
  const url = useObjectUrl(blob);
  return <article className={`size-tile size-${format}`} data-testid={`size-${format}`}>
    <div className="size-media">{url ? <img src={url} alt={label} /> : <span className="size-placeholder" aria-hidden="true" />}</div>
    <div className="size-meta">
      <strong>{label}</strong>
      {badge && <small data-testid={`size-${format}-badge`}>{badge}</small>}
    </div>
    <div className="size-actions">
      {url && <a className="button secondary" href={url} download={`admorph-${format}.png`}>{downloadLabel}</a>}
      {children}
    </div>
  </article>;
}
