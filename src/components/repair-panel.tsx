'use client';
import {ImageComparison} from './image-comparison';
import {metaFetch} from '@/lib/ai/meta-fetch';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Creative } from '@/lib/editor/schema';
import type { Asset } from '@/lib/db/schema';
import { fingerprint } from '@/lib/critic/rules';
import { applyActions, layerChanges, proposeLocal, verifyRepair } from '@/lib/repair/engine';
import { repairResponseSchema, type RepairAction, type RepairReceipt } from '@/lib/repair/schema';
import { loadLatestRepair } from '@/lib/repair/repository';
import { previewJpeg } from '@/lib/critic/preview';
import { ProviderError, errorCode, errorCodes, type ErrorCode } from '@/lib/ai/errors';
import { readJsonLimited } from '@/lib/ai/transport';
import { z } from 'zod';
import { useProviderSession } from './provider-session';
import { useMessages, useWorkspace } from './workspace';
import { useStudio } from './studio-session';
import type { CanvasHandle } from './design-canvas';
type Proposal = { before: Creative; after: Creative; actions: RepairAction[]; rationale: string; source: 'local' | 'meta'; language: 'en' | 'ar'; model: RepairReceipt['model']; verification: ReturnType<typeof verifyRepair>; iteration: 1 | 2; rootFingerprint: string };
const memory = new Map<string, { record: RepairReceipt; persisted: boolean }>();
export function RepairPanel({ creative, creativeLanguage, assets, handleRef, ready }: { creative: Creative; creativeLanguage: 'en' | 'ar'; assets: Asset[]; handleRef: React.RefObject<CanvasHandle | null>; ready: boolean }) {
  const m = useMessages(), r = m.repair; const { locale } = useWorkspace(), studio = useStudio(), provider = useProviderSession();
  const signature = fingerprint(creative), selected = provider.taskModel('edit');
  const compatible = selected?.provider === 'meta' ;
  const key = selected ? provider.configs[selected.provider].apiKey.trim() : '';
  const scope = JSON.stringify([signature, locale, selected, provider.keyEpoch]);
  const [proposal, setProposal] = useState<Proposal | null>(null), [receipt, setReceipt] = useState(() => memory.get(creative.id) ?? null);
  const [consent, setConsent] = useState<string | null>(null), [pending, setPending] = useState<string | null>(null), [applying, setApplying] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null), [comparison, setComparison] = useState<{ before: string; after: string } | null>(null);
  const abort = useRef<AbortController | null>(null), token = useRef(0), dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => () => { token.current++; abort.current?.abort(); }, [scope]);
  useEffect(() => {
    let alive = true;
    loadLatestRepair(creative.id).then(saved => { const cached = memory.get(creative.id); if (alive) setReceipt(cached && (!saved || cached.record.appliedAt >= saved.appliedAt) ? cached : saved ? { record: saved, persisted: true } : null); }).catch(() => {});
    return () => { alive = false; };
  }, [creative.id]);
  const currentAfter = !!receipt && signature === fingerprint(receipt.record.after), currentBefore = !!receipt && signature === fingerprint(receipt.record.before);
  const limited = currentAfter && receipt!.record.iteration >= 2;
  const fresh = !!proposal && fingerprint(proposal.before) === signature && proposal.language === locale;
  const changes = proposal ? layerChanges(proposal.before, proposal.after) : [];
  const busy = pending === scope;
  function build(actions: RepairAction[], rationale: string, source: 'local' | 'meta') {
    if (!handleRef.current) throw new ProviderError('repair_invalid');
    const after = applyActions(creative, actions), verification = verifyRepair(creative, after, layers => handleRef.current!.measureText(layers), new Set(assets.map(asset => asset.id)));
    setProposal({ before: structuredClone(creative), after, actions, rationale, source, model: source === 'meta' ? selected ?? null : null, language: locale,
      verification, iteration: currentAfter ? Math.min(2, receipt!.record.iteration + 1) as 1 | 2 : 1, rootFingerprint: currentAfter ? receipt!.record.rootFingerprint : signature });
  }
  function local() {
    if (!ready || busy || limited || !handleRef.current) return;
    setError(null);
    try { build(proposeLocal(creative, layers => handleRef.current!.measureText(layers), new Set(assets.map(asset => asset.id))), r.localReason, 'local'); }
    catch { setError('repair_invalid'); }
  }
  async function ai() {
    if (!ready || !compatible || !selected || !key || consent !== scope || busy || limited || !handleRef.current) return;
    const id = ++token.current, controller = new AbortController(); abort.current = controller; setPending(scope); setError(null);
    try {
      const preview = await previewJpeg(handleRef.current); if (controller.signal.aborted) return;
      const response = await metaFetch('edit','/api/ai/repairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'meta', modelId: selected.modelId, apiKey: key, consent: true, imageConsent: true, language: locale, creativeLanguage, creative, preview }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]), cache: 'no-store' });
      const body = await readJsonLimited(response, 100000);
      if (!response.ok) { const parsed = z.object({ error: z.object({ code: z.enum(errorCodes) }) }).safeParse(body); throw new ProviderError(parsed.success ? parsed.data.error.code : 'repair_invalid', response.status); }
      const result = repairResponseSchema.parse(body);
      if (id === token.current && !controller.signal.aborted) { build(result.actions, result.rationale, 'meta'); setConsent(null); }
    } catch (cause) { if (id === token.current) setError(cause instanceof ProviderError ? errorCode(cause) : 'repair_invalid'); }
    finally { if (id === token.current) { setPending(null); abort.current = null; } }
  }
  function compare(before: Creative, after: Creative) {
    if (!ready || !handleRef.current) return;
    setError(null);
    try { const images = { before: handleRef.current.renderLayers(before.layers), after: handleRef.current.renderLayers(after.layers) }; setComparison(images); requestAnimationFrame(() => dialogRef.current?.showModal()); }
    catch { setError('repair_assets'); }
  }
  async function apply() {
    if (!proposal || !fresh || proposal.verification.regression || !changes.length || applying || limited) return;
    setApplying(true); setError(null);
    const now = new Date().toISOString(), record: RepairReceipt = { id: crypto.randomUUID(), creativeId: creative.id, appliedAt: now, source: proposal.source, model: proposal.model,
      language: proposal.language, rationale: proposal.rationale, actions: proposal.actions, before: proposal.before, after: { ...proposal.after, updatedAt: now }, iteration: proposal.iteration, rootFingerprint: proposal.rootFingerprint };
    try {
      const result = await studio.applyRepair(record);
      if (!result.applied) { setError('repair_stale'); return; }
      const saved = { record, persisted: result.persisted }; memory.set(creative.id, saved); setReceipt(saved); setProposal(null);
    } catch { setError('repair_invalid'); }
    finally { setApplying(false); }
  }
  const count = (result: Proposal['verification']['before']) => result.issues.filter(issue => issue.severity !== 'info').length;
  return <section className="repair-panel" aria-labelledby="repair-heading"><h3 id="repair-heading">{r.title}</h3><p>{r.intro}</p>
    <button className="button secondary" disabled={!ready || busy || applying || limited} onClick={local}>{r.local}</button>
    <details><summary>{r.aiTitle}</summary><p>{r.aiHelp}</p><strong>{selected ? `${selected.provider} / ${selected.modelId}` : r.noModel}</strong><p><Link href="/settings">{m.campaign.openSettings} ↗</Link></p>
      <label className="studio-consent"><input type="checkbox" checked={consent === scope} disabled={!ready || !compatible || !key || busy || limited} onChange={event => setConsent(event.target.checked ? scope : null)}/><span>{r.consent}</span></label><p>{m.studio.billing}</p>
      <button className="button secondary" disabled={!ready || !compatible || !key || consent !== scope || busy || applying || limited} onClick={() => void ai()}>{busy ? r.planning : r.aiButton}</button>
      {busy && <button className="button secondary" onClick={() => { abort.current?.abort(); token.current++; setPending(null); setError('cancelled'); }}>{m.campaign.cancel}</button>}
    </details>
    {limited && <p className="campaign-notice">{r.limit}</p>}
    {proposal && <article className="repair-proposal" data-testid="repair-proposal"><strong>{proposal.source === 'local' ? r.localBadge : r.aiBadge}</strong><p>{proposal.rationale}</p>
      {!fresh && <p className="campaign-notice">{r.stale}</p>}
      {!changes.length ? <p>{r.empty}</p> : <><p>{r.clamped}</p><div className="repair-diff"><table><thead><tr><th>{r.property}</th><th>{r.before}</th><th>{r.after}</th></tr></thead><tbody>{changes.map(change => <tr key={`${change.layerId}:${change.property}`}><th>{m.studio.kinds[change.kind]} · {r.properties[change.property]}</th><td>{typeof change.before === 'boolean' ? change.before ? r.visible : r.hidden : String(change.before)}</td><td>{typeof change.after === 'boolean' ? change.after ? r.visible : r.hidden : String(change.after)}</td></tr>)}</tbody></table></div>
        <p>{r.measured}: {count(proposal.verification.before)} → {count(proposal.verification.after)}</p><p>{r.limits}</p>
        {proposal.verification.regression && <p className="campaign-notice">{r.regression}</p>}
        <button className="button secondary" disabled={!ready} onClick={() => compare(proposal.before, proposal.after)}>{r.preview}</button>
        <button className="button primary" disabled={!fresh || proposal.verification.regression || applying || limited} onClick={() => void apply()}>{applying ? r.applying : r.apply}</button>
      </>}
    </article>}
    {receipt && <article className="repair-receipt" data-testid="repair-receipt"><strong>{r.applied}</strong><p>{receipt.record.iteration}/2 · {new Date(receipt.record.appliedAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')} · {receipt.persisted ? r.saved : r.sessionOnly}</p>
      <p>{currentAfter ? r.currentAfter : currentBefore ? r.currentBefore : r.laterEdits}</p>
      <button className="button secondary" disabled={!ready} onClick={() => compare(receipt.record.before, receipt.record.after)}>{r.compare}</button>
      <button className="button secondary" disabled={!currentAfter || applying} onClick={() => { if (!studio.restoreRepair(fingerprint(receipt.record.after), receipt.record.before)) setError('repair_stale'); }}>{r.undo}</button>
      <button className="button secondary" disabled={!currentBefore || applying} onClick={() => { if (!studio.restoreRepair(fingerprint(receipt.record.before), receipt.record.after)) setError('repair_stale'); }}>{r.redo}</button>
    </article>}
    {error && <p className="request-error" role="alert">{m.settings.errors[error]}</p>}
    <dialog className="repair-dialog" ref={dialogRef} aria-labelledby="repair-comparison-title" onClose={() => setComparison(null)}><h2 id="repair-comparison-title">{r.comparisonTitle}</h2><p>{r.comparisonHelp}</p>
      {comparison && <ImageComparison before={comparison.before} after={comparison.after} beforeLabel={r.before} afterLabel={r.after} beforeAlt={r.beforeAlt} afterAlt={r.afterAlt}/>}
      <button className="button primary" onClick={() => dialogRef.current?.close()}>{r.close}</button>
    </dialog>
  </section>;
}
