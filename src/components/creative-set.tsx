'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Campaign } from '@/lib/campaign/schema';
import type { Asset } from '@/lib/db/schema';
import { useStudio } from './studio-session';
import { useCampaign } from './campaign-session';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { cutoutImage, SAM_PRODUCT_PROMPT } from '@/lib/cutout/provider';
import { findCutoutAsset } from '@/lib/cutout/provenance';
import { getDatabase } from '@/lib/db/dexie';
const Preview = dynamic(() => import('./creative-preview'), { ssr: false });
export function CreativeSet({ campaign, product }: { campaign: Campaign; product: Asset | null }) {
  const studio = useStudio(), session = useCampaign(), workspace = useWorkspace(), provider = useProviderSession(), m = useMessages(), s = m.creativeSet;
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<'saved' | 'session' | 'error' | null>(null);
  const [cutoutNote, setCutoutNote] = useState('');
  const { restoreSet } = studio;
  const identity = campaign.concepts.map(item => item.id).join(':');
  useEffect(() => { let alive = true; restoreSet(campaign).catch(() => { if (alive) setStatus('error'); }); return () => { alive = false; };
    // Only identities trigger disk reads; cached manual edits always win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, identity, restoreSet]);
  const entries = studio.listSet(campaign), approved = campaign.concepts.length === 3 && campaign.concepts.every(item => item.approved) && campaign.planRevision === campaign.inputRevision;
  async function prepare(source: Campaign = campaign) {
    const ready = source.concepts.length === 3 && source.concepts.every(item => item.approved) && source.planRevision === source.inputRevision;
    if (!ready || !product || busy) return; setBusy(true); setStatus(null); setCutoutNote('');
    const brand = workspace.brands.find(item => item.id === source.brandId), logo = workspace.assets.find(item => item.id === brand?.logoAssetId) ?? null;
    // Effective product: a stored cutout for this product wins; otherwise,
    // when auto-cutout is on, segment once now (SAM first, local fallback
    // with a visible note) so the whole set is built on the cutout.
    let effectiveProduct = product, note = '';
    const mode = source.autoCutout ?? 'off';
    if (mode !== 'off') {
      const library = await getDatabase().assets.where('kind').equals('cutout').toArray().catch(() => [] as Asset[]);
      const existing = findCutoutAsset(library, product.id);
      if (existing) {
        effectiveProduct = existing;
      } else {
        try {
          const key = provider.configs.meta.apiKey.trim(), segmentModel = provider.taskModel('segment')?.modelId ?? '';
          let result;
          if (mode === 'sam' && key && segmentModel) {
            try {
              result = await cutoutImage(product.blob, 'meta-sam', { apiKey: key, modelId: segmentModel, prompt: SAM_PRODUCT_PROMPT });
            } catch {
              result = await cutoutImage(product.blob, 'local');
              note = m.cutout.samFallbackNote;
            }
          } else {
            if (mode === 'sam') note = m.cutout.samFallbackNote;
            result = await cutoutImage(product.blob, 'local');
          }
          const asset: Asset = { id: crypto.randomUUID(), kind: 'cutout', blob: result.cutoutBlob, createdAt: new Date().toISOString(), meta: { derivedFrom: product.id, provider: result.provider, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight, reliable: result.reliable } };
          try { await getDatabase().assets.put(asset); } catch { /* library save is best-effort */ }
          effectiveProduct = asset;
        } catch {
          note = m.cutout.cutoutFailed;
        }
      }
    }
    try { const saved = await studio.prepareSet(source, effectiveProduct, logo, session.isNewCampaign(source.id)); setStatus(saved ? 'saved' : 'session'); }
    catch { setStatus('error'); } finally { setBusy(false); }
    if (note) setCutoutNote(note);
  }
  async function approveAllAndCreate() {
    if (busy || !product || campaign.concepts.length !== 3 || campaign.planRevision !== campaign.inputRevision) return;
    const next = { ...campaign, concepts: campaign.concepts.map(item => ({ ...item, approved: true })) };
    session.update(next);
    await prepare(next);
  }
  return <section className="creative-set" aria-labelledby="creative-set-heading"><div className="concept-heading"><div><span className="eyebrow">{s.eyebrow}</span><h2 id="creative-set-heading">{s.title}</h2></div><span>{entries.length}/3</span></div>
    <p>{s.help}</p><button className="button primary" disabled={!approved || !product || busy} onClick={() => void prepare()}>{busy ? s.creating : s.create}</button>
    {!approved && campaign.concepts.length === 3 && campaign.planRevision === campaign.inputRevision && <button className="button secondary" disabled={!product || busy} onClick={() => void approveAllAndCreate()}>{s.approveAllCreate}</button>}
    {!approved && <p>{s.approvalRequired}</p>}<p className="field-help">{s.preserve}</p>{status && <p role={status === 'error' ? 'alert' : 'status'} data-testid="set-save">{s[status]}</p>}{cutoutNote && <p role="status">{cutoutNote}</p>}
    <div className="creative-set-grid">{campaign.concepts.map((concept, index) => { const entry = entries.find(item => item.creative.conceptId === concept.id), canOpen = concept.approved && campaign.planRevision === campaign.inputRevision; return <article className="creative-set-card" key={concept.id} data-testid="creative-set-card"><span className="eyebrow">0{index + 1} · {m.campaign.angles[concept.angle]}</span><h3>{concept.title}</h3>
      {entry ? <><span className="concept-source">{m.studio.sources[entry.creative.source]}</span><Preview entry={entry} rtl={campaign.creativeLanguage === 'ar'} number={index + 1}/><p className="creative-caption" dir={campaign.creativeLanguage === 'ar' ? 'rtl' : 'ltr'}>{entry.creative.caption}</p></> : <div className="creative-placeholder"><span aria-hidden="true">✳</span><p>{s.empty}</p></div>}
      {canOpen ? <Link className="button secondary" href={`/studio/${campaign.id}?concept=${concept.id}`}>{s.edit.replace('{number}', String(index + 1))} ↗</Link> : <p>{s.approvalRequired}</p>}
      {entry && (!concept.approved || entry.creative.inputRevision !== campaign.inputRevision) && <p className="campaign-notice">{s.stale}</p>}
    </article>; })}</div>
  </section>;
}
