'use client';
/* eslint-disable @next/next/no-img-element -- Validated local Blob URLs are not server-optimizable. */
import { useEffect, useRef, useState } from 'react';
import { useProviderSession } from './provider-session';
import { useMessages } from './workspace';
import { useObjectUrl } from './logo';
import { metaTextSmokeSchema } from '@/lib/ai/meta-smoke-schema';
import { ProviderError, errorCode, errorCodes, type ErrorCode } from '@/lib/ai/errors';
import { readJsonLimited } from '@/lib/ai/transport';
import { z } from 'zod';
type Evidence = { source: 'live' | 'fixture'; kind: 'text' | 'image'; modelId: string; checkedAtUTC: string; requestId?: string | null; reply?: string; width?: number; height?: number };
export function MetaSmoke() {
  const m = useMessages(), s = m.metaSmoke, provider = useProviderSession();
  const key = provider.configs.meta.apiKey.trim(), catalog = provider.catalogs.meta;
  const [kind, setKind] = useState<'text' | 'image'>('text'), [modelId, setModelId] = useState(''), [ack, setAck] = useState(false), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ErrorCode | null>(null), [evidence, setEvidence] = useState<Evidence | null>(null), [image, setImage] = useState<Blob | null>(null);
  const abort = useRef<AbortController | null>(null), token = useRef(0), url = useObjectUrl(image);
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) { setConsent(false); setEvidence(null); setImage(null); setBusy(false); setError(null); } });
    return () => { alive = false; };
  }, [key, kind, modelId, provider.keyEpoch]);
  useEffect(() => () => { token.current++; abort.current?.abort(); }, [key, kind, modelId, provider.keyEpoch]);
  const capability = kind === 'text' ? 'text' : 'image_output', known = catalog?.models.find(model => model.id === modelId.trim());
  const supported = known?.availability !== 'unavailable' && (known?.capabilities.includes(capability) || ack);
  const valid = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(modelId.trim());
  async function run() {
    if (!key || !valid || !supported || !consent || busy) return;
    const id = ++token.current, controller = new AbortController(); abort.current = controller; setBusy(true); setError(null);
    try {
      const response = await fetch('/api/providers/meta-smoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', apiKey: key, kind, modelId: modelId.trim(), consent: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
      if (!response.ok) { const error = z.object({ error: z.object({ code: z.enum(errorCodes) }) }).safeParse(await readJsonLimited(response, 32768)); throw new ProviderError(error.success ? error.data.error.code : 'meta_response', response.status); }
      if (kind === 'text') { const result = metaTextSmokeSchema.parse(await readJsonLimited(response, 12000)); if (id === token.current && !controller.signal.aborted) { setEvidence(result); setImage(null); } }
      else {
        const blob = await response.blob(); if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 3 * 1024 * 1024) throw new ProviderError('meta_response');
        const source = response.headers.get('x-admorph-source'), checkedAtUTC = response.headers.get('x-admorph-checked-at');
        if (!['live', 'fixture'].includes(source ?? '') || !checkedAtUTC || !z.string().datetime().safeParse(checkedAtUTC).success) throw new ProviderError('meta_response');
        const localUrl = URL.createObjectURL(blob); let width = 0, height = 0;
        try { const raster = new Image(); raster.src = localUrl; await raster.decode(); width = raster.width; height = raster.height; if (!width || !height || width > 4096 || height > 4096) throw new ProviderError('meta_response'); } finally { URL.revokeObjectURL(localUrl); }
        if (id === token.current && !controller.signal.aborted) { setImage(blob); setEvidence({ source: source as 'live' | 'fixture', kind: 'image', checkedAtUTC, modelId: modelId.trim(), width, height }); }
      }
      if (id === token.current) setConsent(false);
    } catch (cause) { if (id === token.current) setError(cause instanceof ProviderError ? errorCode(cause) : 'meta_response'); }
    finally { if (id === token.current) { setBusy(false); abort.current = null; } }
  }
  function download() {
    if (!evidence) return;
    const clean = (text: string) => key ? text.split(key).join('[redacted]') : text;
    const blob = new Blob([JSON.stringify({ ...evidence, modelId: clean(evidence.modelId), requestId: evidence.requestId ? clean(evidence.requestId) : null, note: evidence.source === 'live' ? 'Owner-triggered Meta smoke response; this is not a claim that other models or workflows are verified.' : 'Synthetic fixture response; not live Meta evidence.' }, null, 2)], { type: 'application/json' });
    const localUrl = URL.createObjectURL(blob), link = document.createElement('a'); link.href = localUrl; link.download = 'admorph-meta-smoke.json'; link.click(); setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
  }
  return <section className="settings-card meta-smoke"><h2>{s.title}</h2><p>{s.help}</p><p>{s.catalogHelp}</p>
    <label htmlFor="meta-smoke-kind">{s.kind}</label><select id="meta-smoke-kind" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as 'text' | 'image'); setAck(false); }}><option value="text">{s.text}</option><option value="image">{s.image}</option></select>
    <label htmlFor="meta-smoke-model">{s.model}</label><input id="meta-smoke-model" list="meta-smoke-models" value={modelId} disabled={busy} maxLength={240} dir="ltr" onChange={event => { setModelId(event.target.value); setAck(false); }}/><datalist id="meta-smoke-models">{catalog?.models.filter(model => model.availability !== 'unavailable').map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
    <label className="check-label"><input type="checkbox" checked={ack} disabled={busy} onChange={event => setAck(event.target.checked)}/><span>{s.ack}</span></label>
    {!key && <p>{s.needKey}</p>}<label className="check-label"><input type="checkbox" checked={consent} disabled={!key || !valid || !supported || busy} onChange={event => setConsent(event.target.checked)}/><span>{kind === 'text' ? s.textConsent : s.imageConsent}</span></label><p>{m.studio.billing}</p>
    <button className="button secondary" disabled={!key || !valid || !supported || !consent || busy} onClick={() => void run()}>{busy ? s.running : kind === 'text' ? s.runText : s.runImage}</button>
    {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); token.current++; setBusy(false); setError('cancelled'); }}>{m.campaign.cancel}</button>}
    {error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
    {evidence && <article className="meta-evidence" data-testid="meta-smoke-result"><strong>{evidence.source === 'live' ? s.live : s.fixture}</strong><p>{evidence.modelId} · <time dateTime={evidence.checkedAtUTC}>{evidence.checkedAtUTC}</time></p><p>{evidence.kind === 'text' ? 'ready' : `${evidence.width} × ${evidence.height}`}</p>
      {url && <img src={url} alt={s.imageAlt}/>}<p>{s.limits}</p><button className="button secondary" onClick={download}>{s.download}</button>
    </article>}
  </section>;
}
