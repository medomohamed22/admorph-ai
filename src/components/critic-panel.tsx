'use client';
import {metaFetch} from '@/lib/ai/meta-fetch';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { aiReviewSchema, type ReviewRecord, type RuleResult } from '@/lib/critic/schema';
import { checkCreative, fingerprint } from '@/lib/critic/rules';
import { dimensionsFor } from '@/lib/editor/sizes';
import { loadReview, saveReview } from '@/lib/critic/repository';
import { ProviderError, errorCode, errorCodes, type ErrorCode } from '@/lib/ai/errors';
import { readJsonLimited } from '@/lib/ai/transport';
import { z } from 'zod';
import type { Creative } from '@/lib/editor/schema';
import type { Asset } from '@/lib/db/schema';
import type { CanvasHandle } from './design-canvas';
import { useWorkspace, useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { RepairPanel } from './repair-panel';
import { previewJpeg } from '@/lib/critic/preview';
const sessionReviews = new Map<string, ReviewRecord>();
export function CriticPanel({ creative, creativeLanguage, assets, handleRef, ready, fontsReady, active, selectLayer, onFix, brandColors }: {
  creative: Creative; creativeLanguage: 'en' | 'ar'; assets: Asset[]; handleRef: React.RefObject<CanvasHandle | null>; ready: boolean; fontsReady: boolean; active: boolean; selectLayer: (id: string) => void; onFix?: (issue: import('@/lib/critic/schema').Finding) => void; brandColors?: readonly string[];
}) {
  const m = useMessages(), c = m.critic; const { locale } = useWorkspace(); const provider = useProviderSession();
  const signature = fingerprint(creative), selection = provider.taskModel('critic');
  const compatible = selection?.provider === 'meta' ;
  const key = selection ? provider.configs[selection.provider].apiKey.trim() : '';
  const scope = JSON.stringify([signature, locale, selection, provider.keyEpoch]);
  const [local, setLocal] = useState<{ signature: string; result: RuleResult } | null>(null);
  const [record, setRecord] = useState<ReviewRecord | null>(() => sessionReviews.get(creative.id) ?? null), [stored, setStored] = useState(true);
  const [consent, setConsent] = useState<{ scope: string; accepted: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState<ErrorCode | null>(null);
  const abort = useRef<AbortController | null>(null), token = useRef(0);
  const busy = pending === scope;
  useEffect(() => () => { token.current++; abort.current?.abort(); }, [scope]);
  useEffect(() => {
    let alive = true; const initialToken = token.current;
    loadReview(creative.id).then(saved => {
      const memory = sessionReviews.get(creative.id);
      if (alive && initialToken === token.current) setRecord(memory && (!saved || memory.reviewedAt >= saved.reviewedAt) ? memory : saved);
    }).catch(() => { if (alive && initialToken === token.current) { setRecord(sessionReviews.get(creative.id) ?? null); setStored(false); } });
    return () => { alive = false; };
  }, [creative.id]);
  useEffect(() => {
    if (!fontsReady) return;
    const timer = setTimeout(() => {
      if (!handleRef.current) return;
      setLocal({ signature, result: checkCreative(creative, handleRef.current.measureText(), new Set(assets.map(asset => asset.id)), dimensionsFor(creative.format), brandColors) });
    }, 180);
    return () => clearTimeout(timer);
  }, [signature, creative, assets, handleRef, fontsReady, brandColors]);
  const currentLocal = fontsReady && local?.signature === signature ? local.result : null;
  const stale = record && (record.fingerprint !== signature || record.language !== locale);
  async function review() {
    if (!ready || !selection || !compatible || !key || !consent?.accepted || consent.scope !== scope || !handleRef.current || busy) return;
    const id = ++token.current, controller = new AbortController(); abort.current = controller; setPending(scope); setError(null);
    try {
      const preview = await previewJpeg(handleRef.current);
      if (controller.signal.aborted) return;
      const response = await metaFetch('critic','/api/ai/critic', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', modelId: selection.modelId, apiKey: key, consent: true, imageConsent: true, language: locale, creative, preview }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]), cache: 'no-store' });
      const body = await readJsonLimited(response, 100000);
      if (!response.ok) { const parsed = z.object({ error: z.object({ code: z.enum(errorCodes) }) }).safeParse(body); throw new ProviderError(parsed.success ? parsed.data.error.code : 'review_invalid', response.status); }
      const result = aiReviewSchema.safeParse(body);
      if (!result.success || result.data.issues.some(issue => issue.layerId && !creative.layers.some(layer => layer.id === issue.layerId))) throw new ProviderError('review_invalid');
      if (id !== token.current || controller.signal.aborted) return;
      const next: ReviewRecord = { id: creative.id, creativeId: creative.id, fingerprint: signature, reviewedAt: new Date().toISOString(), language: locale, model: selection, source: 'meta', review: result.data };
      sessionReviews.set(creative.id, next); setRecord(next); setConsent(null); setStored(false);
      const persisted = await saveReview(next).then(() => true).catch(() => false);
      if (id === token.current) setStored(persisted);
    } catch (cause) { if (id === token.current) setError(controller.signal.aborted ? 'cancelled' : errorCode(cause)); }
    finally { if (id === token.current) { setPending(null); abort.current = null; } }
  }
  function explain(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, name === 'kind' && value in m.studio.kinds ? m.studio.kinds[value as keyof typeof m.studio.kinds] : String(value)), template);
  }
  return <section id="creative-review" className={`studio-panel critic-panel ${active ? 'active' : ''}`} data-panel="review">
    <span className="eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.intro}</p>
    <div className="critic-local"><h3>{c.localTitle}</h3><p>{c.localHelp}</p>{currentLocal ? <>
      <ul className="critic-checks" aria-label={c.checklist}>{currentLocal.checks.map(check => <li key={check.key}><span>{c.checks[check.key]}</span><strong data-status={check.status}>{c.statuses[check.status]}</strong></li>)}</ul>
      <p role="status" data-testid="local-review-status">{currentLocal.issues.length ? `${currentLocal.issues.length} · ${c.findings}` : c.noFindings}</p>
      {currentLocal.issues.map((issue,index) => <article className={`critic-finding ${issue.severity}`} data-testid={`rule-${issue.code}`} key={issue.id}><span>{c.severities[issue.severity]} · {c.localBadge}</span><h4>{index+1}. {c.rules[issue.code].title}</h4><p>{explain(c.rules[issue.code].explanation, issue.evidence)}</p>
        {onFix&&issue.layerIds.length>0&&<button className="text-button" onClick={()=>onFix(issue)}>{m.meta.fixElement}</button>}{issue.layerIds.map(id => <button key={id} className="text-button" onClick={() => selectLayer(id)}>{c.selectLayer}: {m.studio.kinds[creative.layers.find(layer => layer.id === id)!.kind]}</button>)}</article>)}
    </> : <p role="status">{c.pending}</p>}</div>
    <div className="critic-ai"><h3>{c.aiTitle}</h3><p>{c.aiHelp}</p><strong>{selection ? `${selection.provider} / ${selection.modelId}` : c.noModel}</strong><p>{c.modelHelp}</p><Link href="/settings">{m.campaign.openSettings} ↗</Link>
      {!compatible && selection && <p className="campaign-notice">{c.incompatible}</p>}
      {compatible && !key && <p className="campaign-notice">{m.campaign.keyHelp}</p>}
      <label className="studio-consent"><input type="checkbox" checked={consent?.scope === scope && consent.accepted} disabled={busy || !ready || !compatible || !key} onChange={event => setConsent({ scope, accepted: event.target.checked })}/><span>{m.common.consentShort}</span></label><details><summary>{m.common.consentDetails}</summary><p>{c.consent}</p></details><p>{m.studio.billing}</p>
      <button className="button primary" disabled={busy || !ready || !compatible || !key || !consent?.accepted || consent.scope !== scope} onClick={() => void review()}>{busy ? c.reviewing : c.run}</button>
      {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); token.current++; setPending(null); setError('cancelled'); }}>{m.campaign.cancel}</button>}
      {error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
      {record && <div className="critic-result" data-testid="ai-review"><strong>{c.opinionBadge}</strong><p>{c.notEvidence}</p>{stale && <p className="campaign-notice" role="status">{c.stale}</p>}
        <p>{record.review.summary}</p><p className="critic-meta"><time dateTime={record.reviewedAt}>{new Date(record.reviewedAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</time> · {record.model.modelId} · {stored ? c.saved : c.sessionOnly}</p>
        {!record.review.issues.length && <p>{c.noAiFindings}</p>}{record.review.issues.map((issue, index) => <article className="critic-finding ai" key={index}><span>{c.categories[issue.category]} · {c.aiSeverities[issue.severity]}</span><h4>{issue.title}</h4><p>{issue.explanation}</p><p><b>{c.recommendation}: </b>{issue.recommendation}</p>{issue.layerId && !stale && <button className="text-button" onClick={() => selectLayer(issue.layerId!)}>{c.selectLayer}</button>}</article>)}
      </div>}
    </div><RepairPanel creative={creative} creativeLanguage={creativeLanguage} assets={assets} handleRef={handleRef} ready={ready}/><p>{c.manualOnly}</p>
  </section>;
}
