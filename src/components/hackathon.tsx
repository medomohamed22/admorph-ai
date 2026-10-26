'use client';
import Link from 'next/link';
import { useMessages } from './workspace';

export function Hackathon() {
  const m = useMessages(), s = m.hackathon;
  return <section className="hackathon-page">
    <div className="page-heading"><span className="eyebrow">{s.eyebrow}</span><h1>{s.title}</h1><p>{s.intro}</p></div>
    <div className="hackathon-summary"><div><span>{s.windowLabel}</span><strong>{s.window}</strong></div><div><span>{s.snapshotLabel}</span><strong>{s.snapshotDate}</strong></div><div><span>{s.statusLabel}</span><strong>{s.status}</strong></div></div>
    <article className="settings-card"><h2>{s.recordTitle}</h2><p>{s.statement}</p><p>{s.milestoneNote}</p></article>
    <div className="hackathon-columns"><article className="settings-card"><h2>{s.completedTitle}</h2><ul>{s.completed.map(item => <li key={item}>{item}</li>)}</ul></article><article className="settings-card"><h2>{s.plannedTitle}</h2><ul>{s.planned.map(item => <li key={item}>{item}</li>)}</ul></article></div>
    <article className="settings-card"><h2>{s.metaTitle}</h2><p>{s.metaNote}</p><p>{s.evidence}</p></article>
    <p className="input-hint">{s.deadline}</p><div className="field-actions"><a className="button secondary" href="https://cerebralvalley.ai/e/meta-ai-developer-hackathon" target="_blank" rel="noreferrer">{s.official} ↗</a><Link className="button primary" href="/#demo">{s.demo} ↗</Link></div>
  </section>;
}
