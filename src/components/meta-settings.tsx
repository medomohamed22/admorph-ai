'use client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useProviderSession } from './provider-session';
import { useMessages, useWorkspace } from './workspace';
import { StorageControls } from './storage-controls';
import { SessionPrivacy } from './session-privacy';
import { ProjectBackup } from './project-backup';
import { taskSchema, supportOutcome } from '@/lib/ai/task-support';
import { errorCode, type ErrorCode, ProviderError } from '@/lib/ai/errors';
import { META_MODELS, META_MODEL_ORDER, type MetaModelKey } from '@/lib/ai/models';
import { Button, Card, ModelBadge, Segmented, StatusChip } from './ui';
import { IconKey } from './ui/icons';

type TestState = 'idle' | 'running' | 'passed' | 'failed';

export function MetaSettings() {
  const session = useProviderSession(), m = useMessages(), s = m.settings, t = m.meta, x = m.models, w = useWorkspace();
  const [tests, setTests] = useState<Partial<Record<MetaModelKey, TestState>>>({});
  const [error, setError] = useState<ErrorCode | null>(null), [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null), token = useRef(0);
  const key = session.configs.meta.apiKey, epoch = session.keyEpoch, hasKey = key.trim().length > 0;
  useEffect(() => () => { token.current++; abort.current?.abort(); }, [key, epoch]);
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) setTests({}); }); return () => { alive = false; }; }, [key, epoch]);

  // Optional diagnostic: one small request for the model's main task. Never gates a feature.
  async function test(model: MetaModelKey) {
    const { id: modelId, testTask: task } = META_MODELS[model];
    if (!hasKey) { setError('missing_key'); return; }
    const id = ++token.current, controller = new AbortController(); abort.current = controller;
    setTests(previous => ({ ...previous, [model]: 'running' })); setError(null); setNotice('');
    try {
      const response = await fetch('/api/providers/task-test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'meta', apiKey: key, modelId, task, consent: true, imageConsent: true }), signal: controller.signal });
      const result = await response.json();
      if (id !== token.current) return;
      if (!response.ok) throw new ProviderError(result.error?.code ?? 'invalid_response', response.status);
      const parsed = z.object({ task: taskSchema, modelId: z.string(), status: z.literal('verified_supported'), checkedAt: z.string(), proof: z.string().max(1500) }).parse(result);
      if (parsed.task !== task || parsed.modelId !== modelId) throw new ProviderError('invalid_response');
      await session.recordSupport(task, modelId, 'verified_supported', 'task_response_validated', parsed.proof);
      setTests(previous => ({ ...previous, [model]: 'passed' })); setNotice(t.testPassed);
    } catch (caught) {
      if (id !== token.current) return;
      const code = errorCode(caught); setError(code);
      setTests(previous => ({ ...previous, [model]: 'failed' }));
      await session.recordSupport(task, modelId, supportOutcome(code), code);
    }
  }

  function status(model: MetaModelKey) {
    const state = tests[model] ?? 'idle';
    if (state === 'running') return <StatusChip busy>{x.testing}</StatusChip>;
    if (state === 'passed') return <StatusChip tone="ok">{x.passed}</StatusChip>;
    if (state === 'failed') return <StatusChip tone="bad">{x.failed}</StatusChip>;
    return hasKey ? <StatusChip tone="ok">{x.ready}</StatusChip> : <StatusChip tone="warn">{x.needsKey}</StatusChip>;
  }

  const legacy = Object.values(session.savedRoles ?? {}).some(value => value && value.provider !== 'meta');
  return (
    <div className="page settings-v2 settings-page">
      <div className="page-head reveal-up">
        <div><span className="eyebrow-chip">{x.eyebrow}</span><h1>{x.title}</h1><p>{x.lead}</p></div>
      </div>
      {session.invalidRecords && <p className="campaign-notice">{t.invalidRecords}</p>}
      {legacy && <p className="campaign-notice">{t.legacy}</p>}

      <section aria-labelledby="models-title" className="stack">
        <div><h2 id="models-title" className="section-title">{x.sectionTitle}</h2><p className="section-note">{x.sectionNote}</p></div>
        <div className="model-grid stagger">
          {META_MODEL_ORDER.map(model => {
            const info = META_MODELS[model];
            return (
              <Card as="article" key={model} interactive className="model-card" data-model={model} data-testid={`model-${model}`}>
                <div className="model-card-head">
                  <span className="model-role">{info.role[w.locale]}</span>{status(model)}
                </div>
                <h3><ModelBadge model={model} /></h3>
                <p>{x[model]}</p>
                <code className="model-id" dir="ltr">{info.id}</code>
                <div className="model-card-foot">
                  <Button size="sm" variant="secondary" loading={tests[model] === 'running'} disabled={!hasKey || tests[model] === 'running'}
                    onClick={() => void test(model)} aria-label={`${x.test} · ${info.name}`}>{tests[model] === 'running' ? x.testing : x.test}</Button>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="field-note">{x.testNote}</p>
        {error && <p className="request-error" role="alert">{s.errors[error]}</p>}
        {notice && <p className="request-status" role="status">{notice}</p>}
      </section>

      <div className="settings-split section-gap">
        <Card className="settings-card" data-testid="site-ai-status" data-state={session.siteKey}>
          <h2 className="section-title with-icon"><IconKey size={18} />{x.siteTitle}</h2>
          {session.siteKey === 'ready' && <><StatusChip tone="ok">{x.siteReady}</StatusChip><p className="section-note">{x.siteReadyNote}</p></>}
          {session.siteKey === 'checking' && <StatusChip busy>{x.siteChecking}</StatusChip>}
          {session.siteKey === 'missing' && <><StatusChip tone="warn">{x.siteMissing}</StatusChip><p className="section-note">{x.siteMissingNote}</p></>}
        </Card>
        <Card className="settings-card">
          <h2 className="section-title">{x.language}</h2>
          <p className="section-note">{s.languageNote}</p>
          <Segmented label={s.language} value={w.locale} onChange={value => w.setLocale(value)}
            options={[{ value: 'en', label: s.english }, { value: 'ar', label: s.arabic }]} />
        </Card>
      </div>

      <div className="stack section-gap">
        <h2 className="section-title">{x.dataTitle}</h2>
        <SessionPrivacy />
        <ProjectBackup />
        <StorageControls />
      </div>
    </div>
  );
}
