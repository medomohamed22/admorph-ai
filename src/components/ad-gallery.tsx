'use client';
import { useEffect, useState } from 'react';
import { useMessages } from './workspace';
import { useObjectUrl } from './logo';
import { ButtonLink, Button, Toast } from './ui';
import { IconCalendar, IconLayers, IconSparkles } from './ui/icons';
import { loadSavedAds, deleteSavedAd } from '@/lib/db/repository';
import type { SavedAd } from '@/lib/db/schema';

function GalleryCard({ ad, armed, onDelete }: { ad: SavedAd; armed: boolean; onDelete: () => void }) {
  const t = useMessages().gallery;
  const url = useObjectUrl(ad.blob);
  return <article className="gallery-card" data-testid="gallery-card">
    <div className="gallery-card-media">{url && <img src={url} alt={ad.headline || ad.brand.name} loading="lazy" />}</div>
    <div className="gallery-card-body">
      <strong>{ad.brand.name}</strong>
      {ad.headline && <span>{ad.headline}</span>}
      <small>{t[`source_${ad.source}`]} · {ad.createdAt.slice(0, 10)}</small>
    </div>
    <div className="gallery-card-actions">
      <ButtonLink size="sm" href={`/variants?ad=${ad.id}`} icon={<IconLayers size={15} />}>{t.makeVariants}</ButtonLink>
      <ButtonLink size="sm" href={`/themes?ad=${ad.id}`} icon={<IconCalendar size={15} />}>{t.makeSeasonal}</ButtonLink>
      {url && <a className="ui-btn ui-btn--ghost ui-btn--sm" href={url} download="admorph-ad.png">{t.download}</a>}
      <Button size="sm" variant="danger" onClick={onDelete}>{armed ? t.confirmDelete : t.delete}</Button>
    </div>
  </article>;
}

/** "My gallery": every finished ad saved in IndexedDB, with the variants and
 *  seasonal tools as actions on each ad instead of separate nav items. */
export default function AdGallery() {
  const t = useMessages().gallery;
  const [ads, setAds] = useState<SavedAd[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  useEffect(() => {
    let alive = true;
    loadSavedAds().then(items => { if (alive) setAds(items); }).catch(() => { if (alive) { setAds([]); setFailed(true); } });
    return () => { alive = false; };
  }, []);

  async function remove(ad: SavedAd) {
    if (armed !== ad.id) { setArmed(ad.id); return; }
    setArmed(null);
    try { await deleteSavedAd(ad.id); setAds(previous => (previous ?? []).filter(item => item.id !== ad.id)); setNotice({ text: t.deleted, tone: 'ok' }); }
    catch { setNotice({ text: t.deleteFailed, tone: 'bad' }); }
  }

  return <main className="remix-page gallery-page">
    <div className="page-head reveal-up"><div><h1>{t.title}</h1><p>{t.lead}</p></div></div>
    <div className="gallery-tools">
      <ButtonLink href="/variants" icon={<IconLayers size={16} />}>{t.variants}</ButtonLink>
      <ButtonLink href="/themes" icon={<IconCalendar size={16} />}>{t.themes}</ButtonLink>
    </div>
    {failed && <p className="request-error" role="alert">{t.loadFailed}</p>}
    {notice && <Toast message={notice.text} tone={notice.tone} onDone={() => setNotice(null)} />}
    {ads === null
      ? <div className="gallery-grid" aria-busy="true">{[0, 1, 2].map(index => <div key={index} className="gallery-card gallery-skeleton" />)}</div>
      : ads.length === 0
        ? <div className="empty-state" data-testid="gallery-empty">
            <span className="empty-state-art" aria-hidden="true"><IconSparkles size={28} /></span>
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyLead}</p>
            <ButtonLink variant="primary" href="/oneshot">{t.emptyCta}</ButtonLink>
          </div>
        : <div className="gallery-grid">{ads.map(ad => <GalleryCard key={ad.id} ad={ad} armed={armed === ad.id} onDelete={() => void remove(ad)} />)}</div>}
  </main>;
}
