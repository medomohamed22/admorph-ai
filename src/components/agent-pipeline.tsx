'use client';
import { useState } from 'react';
import { useMessages } from './workspace';
import { WaitingText } from './waiting';
import { ModelBadge } from './ui';
import { IconCheck } from './ui/icons';
import { AGENT_STEPS, stepSeconds, type AgentRecords, type AgentStepId, type StepRecord } from '@/lib/agent/pipeline';

export type RepairRecord = StepRecord & { firstScore?: number; secondScore?: number };

function StepCard({ index, id, model, record, onRetry }: { index: number; id: AgentStepId | 'repair'; model: 'spark' | 'image' | 'sam' | 'local'; record: StepRecord; onRetry?: () => void }) {
  const t = useMessages().agent;
  const [open, setOpen] = useState(false);
  const seconds = stepSeconds(record);
  const name = t[`step_${id}`];
  return <li className={`agent-step is-${record.status}`} data-testid={`agent-step-${id}`} data-status={record.status} aria-current={record.status === 'running' ? 'step' : undefined}>
    <span className="agent-step-mark" aria-hidden="true">{record.status === 'done' ? <IconCheck size={16} className="agent-check" /> : record.status === 'failed' ? '!' : index}</span>
    <div className="agent-step-body">
      <div className="agent-step-head">
        <strong>{name}</strong>
        {model === 'local' ? <span className="model-badge model-badge--chip" data-model="local"><i aria-hidden="true" />{t.localCheck}</span> : <ModelBadge model={model} chip />}
      </div>
      <p className="agent-step-state">
        {record.status === 'running' ? <WaitingText label={t.running} />
          : record.status === 'done' ? <>{t.done}{seconds !== null ? ` · ${seconds} ${t.seconds}` : ''}</>
            : record.status === 'failed' ? t.failed
              : record.status === 'skipped' ? t.skipped : t.waiting}
      </p>
      {record.result && <p className="agent-step-result">{record.result}</p>}
      {record.status === 'failed' && <>
        {record.error && <p className="agent-step-error">{record.error}</p>}
        {onRetry && <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onRetry}>{t.retry}</button>}
      </>}
      {record.detail && <>
        <button type="button" className="agent-details-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? t.hideDetails : t.showDetails}</button>
        {open && <div className="agent-details" dir="ltr">
          {record.detail.request !== undefined && <><h4>{t.request}</h4><pre>{JSON.stringify(record.detail.request, null, 2)}</pre></>}
          {record.detail.response !== undefined && <><h4>{t.response}</h4><pre>{JSON.stringify(record.detail.response, null, 2)}</pre></>}
        </div>}
      </>}
    </div>
  </li>;
}

/**
 * The agent screen: one card per pipeline step, each with its model badge,
 * live timer, result line and a retry on failure. A vertical rail beside the
 * work on wide screens, a compact horizontal strip on phones.
 */
export function AgentPipeline({ records, repair, onRetry }: { records: AgentRecords; repair?: RepairRecord | null; onRetry?: Partial<Record<AgentStepId | 'repair', () => void>> }) {
  const t = useMessages().agent;
  const finished = AGENT_STEPS.filter(step => records[step.id].status === 'done' || records[step.id].status === 'skipped').length;
  return <section className="agent-pipeline" aria-label={t.title} data-testid="agent-pipeline">
    <div className="agent-head">
      <h2>{t.title}</h2>
      <span className="agent-progress" aria-live="polite">{finished}/{AGENT_STEPS.length}</span>
    </div>
    <ol className="agent-steps">
      {AGENT_STEPS.map((step, index) => <StepCard key={step.id} index={index + 1} id={step.id} model={step.model} record={records[step.id]} onRetry={onRetry?.[step.id]} />)}
      {repair && <StepCard index={AGENT_STEPS.length + 1} id="repair" model="image" record={repair} onRetry={onRetry?.repair} />}
    </ol>
  </section>;
}
