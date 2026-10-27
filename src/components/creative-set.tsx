'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Campaign } from '@/lib/campaign/schema';
import type { Asset } from '@/lib/db/schema';
import { useStudio } from './studio-session';
import { useCampaign } from './campaign-session';
import { useMessages, useWorkspace } from './workspace';
const Preview = dynamic(() => import('./creative-preview'), { ssr: false });
export function CreativeSet({ campaign, product }: { campaign: Campaign; product: Asset | null }) {
  const studio = useStudio(), session = useCampaign(), workspace = useWorkspace(), m = useMessages(), s = m.creativeSet;
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<'saved' | 'session' | 'error' | null>(null);
  const { restoreSet } = studio;
  const identity = campaign.concepts.map(item => item.id).join(':');
  useEffect(() => { let alive = true; restoreSet(campaign).catch(() => { if (alive) setStatus('error'); }); return () => { alive = false; };
    // Only identities trigger disk reads; cached manual edits always win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, identity, restoreSet]);
  const entries = studio.listSet(campaign), approved = campaign.concepts.length === 3 && campaign.concepts.every(item => item.approved) && campaign.planRevision === campaign.inputRevision;
  async function prepare() {
    if (!approved || !product || busy) return; setBusy(true); setStatus(null);
    const brand = workspace.brands.find(item => item.id === campaign.brandId), logo = workspace.assets.find(item => item.id === brand?.logoAssetId) ?? null;
    try { const saved = await studio.prepareSet(campaign, product, logo, session.isNewCampaign(campaign.id)); setStatus(saved ? 'saved' : 'session'); }
    catch { setStatus('error'); } finally { setBusy(false); }
  }
  return <section className="creative-set" aria-labelledby="creative-set-heading"><div className="concept-heading"><div><span className="eyebrow">{s.eyebrow}</span><h2 id="creative-set-heading">{s.title}</h2></div><span>{entries.length}/3</span></div>
    <p>{s.help}</p><button className="button primary" disabled={!approved || !product || busy} onClick={() => void prepare()}>{busy ? s.creating : s.create}</button>
    {!approved && <p>{s.approvalRequired}</p>}<p className="field-help">{s.preserve}</p>{status && <p role={status === 'error' ? 'alert' : 'status'} data-testid="set-save">{s[status]}</p>}
    <div className="creative-set-grid">{campaign.concepts.map((concept, index) => { const entry = entries.find(item => item.creative.conceptId === concept.id), canOpen = concept.approved && campaign.planRevision === campaign.inputRevision; return <article className="creative-set-card" key={concept.id} data-testid="creative-set-card"><span className="eyebrow">0{index + 1} · {m.campaign.angles[concept.angle]}</span><h3>{concept.title}</h3>
      {entry ? <><span className="concept-source">{m.studio.sources[entry.creative.source]}</span><Preview entry={entry} rtl={campaign.creativeLanguage === 'ar'} number={index + 1}/><p className="creative-caption" dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'}>{entry.creative.caption}</p></> : <div className="creative-placeholder"><span aria-hidden="true">✳</span><p>{s.empty}</p></div>}
      {canOpen ? <Link className="button secondary" href={`/studio/${campaign.id}?concept=${concept.id}`}>{s.edit.replace('{number}', String(index + 1))} ↗</Link> : <p>{s.approvalRequired}</p>}
      {entry && (!concept.approved || entry.creative.inputRevision !== campaign.inputRevision) && <p className="campaign-notice">{s.stale}</p>}
    </article>; })}</div>
  </section>;
}
