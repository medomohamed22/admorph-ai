'use client';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useMessages, useWorkspace } from './workspace';
import { useObjectUrl } from './logo';
import { ButtonLink } from './ui';
import { IconArrow, IconLayers, IconSparkles } from './ui/icons';
import { META_MODELS, META_MODEL_ORDER } from '@/lib/ai/models';
import { parseShowcase } from '@/lib/showcase/manifest';
import { loadSavedAds } from '@/lib/db/repository';
import type { SavedAd } from '@/lib/db/schema';
import showcaseJson from '../../public/showcase/showcase.json';

const showcase = parseShowcase(showcaseJson);

/** The headline appears word by word (60ms apart). */
function StaggerTitle({ text }: { text: string }) {
  return <h1 className="home-title" aria-label={text}>
    {text.split(' ').map((word, index) => <Fragment key={index}><span aria-hidden="true" className="home-word" style={{ '--i': index } as CSSProperties}>{word}</span>{' '}</Fragment>)}
  </h1>;
}

/**
 * Before/after comparison with a draggable handle. The range input carries
 * keyboard and screen-reader control; pointer drags anywhere on the frame
 * move it too. It sweeps once on first view to show it can be dragged.
 */
export function BeforeAfter({ before, after, beforeLabel, afterLabel, handleLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string; handleLabel: string }) {
  const [position, setPosition] = useState(50);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { locale } = useWorkspace();
  const rtl = locale === 'ar';
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const keys = [50, 78, 28, 50], started = performance.now(), each = 650;
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - started) / each, index = Math.floor(t);
      if (index >= keys.length - 1) { setPosition(50); return; }
      const local = t - index, eased = local < .5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
      setPosition(keys[index] + (keys[index + 1] - keys[index]) * eased);
      raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 900);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);
  function fromPointer(clientX: number) {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * 100;
    setPosition(rtl ? 100 - ratio : ratio);
  }
  // In RTL the "after" side grows from the right, matching reading order.
  const clip = rtl ? `inset(0 0 0 ${100 - position}%)` : `inset(0 ${100 - position}% 0 0)`;
  return <div className="before-after" ref={frame} data-testid="before-after"
    onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); fromPointer(event.clientX); }}
    onPointerMove={event => { if (dragging.current) fromPointer(event.clientX); }}
    onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
    <Image className="ba-before" src={before} alt={beforeLabel} draggable={false} fill priority sizes="(max-width: 1024px) 92vw, 560px" />
    <Image className="ba-after" src={after} alt={afterLabel} draggable={false} fill priority sizes="(max-width: 1024px) 92vw, 560px" style={{ clipPath: clip }} />
    <span className="ba-tag ba-tag--before">{beforeLabel}</span>
    <span className="ba-tag ba-tag--after">{afterLabel}</span>
    <span className="ba-handle" aria-hidden="true" style={{ insetInlineStart: `${position}%` }}><i /></span>
    <input className="ba-range" type="range" min={0} max={100} step={1} value={Math.round(position)} aria-label={handleLabel} onChange={event => setPosition(Number(event.target.value))} />
  </div>;
}

function SavedAdTile({ ad, label }: { ad: SavedAd; label: string }) {
  const url = useObjectUrl(ad.blob);
  return <figure className="home-ad" data-testid="home-saved-ad">
    {url && <img src={url} alt={ad.headline || ad.brand.name} loading="lazy" />}
    <figcaption><span>{ad.brand.name}</span><small>{label}</small></figcaption>
  </figure>;
}

export default function HomePage() {
  const m = useMessages(), t = m.home;
  const [saved, setSaved] = useState<SavedAd[]>([]);
  useEffect(() => {
    let alive = true;
    loadSavedAds().then(items => { if (alive) setSaved(items.slice(0, 8)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const ads = showcase.ads;
  return <div className="home">
    <section className="home-hero">
      <div className="home-hero-copy">
        <span className="home-eyebrow"><span className="dot" />{t.eyebrow}</span>
        <StaggerTitle text={t.title} />
        <p className="home-lead">{t.lead}</p>
        <div className="home-actions">
          <ButtonLink variant="primary" size="lg" href="/oneshot" icon={<IconSparkles size={18} />}>{t.cta}</ButtonLink>
          <ButtonLink size="lg" href="/shelf" icon={<IconLayers size={18} />}>{t.shelfCta}</ButtonLink>
        </div>
      </div>
      <div className="home-hero-visual">
        <BeforeAfter before={showcase.hero.before} after={showcase.hero.after} beforeLabel={t.before} afterLabel={t.after} handleLabel={t.compare} />
        {showcase.hero.sample && <p className="home-sample-note" data-testid="home-sample-note">{t.sampleNote}</p>}
      </div>
    </section>

    <section className="home-powered" aria-labelledby="home-powered-title">
      <h2 id="home-powered-title">{t.poweredBy}</h2>
      <ul>
        {META_MODEL_ORDER.map(key => <li key={key} data-model={key}>
          <i aria-hidden="true" />
          <strong>{META_MODELS[key].name}</strong>
          <span>{t[`role_${key}`]}</span>
        </li>)}
      </ul>
    </section>

    <section className="home-steps" aria-labelledby="home-steps-title">
      <h2 id="home-steps-title">{t.howTitle}</h2>
      <ol>
        {(['how1', 'how2', 'how3'] as const).map((key, index) => <li key={key} style={{ '--i': index } as CSSProperties}><b>{index + 1}</b><span>{t[key]}</span></li>)}
      </ol>
    </section>

    <section className="home-gallery" aria-labelledby="home-gallery-title">
      <div className="home-gallery-head">
        <h2 id="home-gallery-title">{ads.length > 0 ? t.galleryTitle : saved.length > 0 ? t.yourAdsTitle : t.galleryTitle}</h2>
        {saved.length > 0 && <ButtonLink size="sm" href="/gallery" icon={<IconArrow size={15} />}>{t.openGallery}</ButtonLink>}
      </div>
      {ads.length > 0 && <>
        <p className="home-gallery-note">{t.showcaseNote}</p>
        <div className="home-ad-grid">{ads.map(ad => <figure key={ad.src} className="home-ad" data-ratio={ad.ratio} data-testid="home-showcase-ad">
          <Image src={ad.src} alt={ad.headline} width={1080} height={ad.ratio === '1:1' ? 1080 : ad.ratio === '9:16' ? 1920 : 1350} sizes="(max-width: 640px) 92vw, 380px" />
          <figcaption><span>{t[`category_${ad.category}`]} · {ad.ratio}</span>{ad.score !== null && <small>{t.certificate} {ad.score}/100</small>}</figcaption>
        </figure>)}</div>
      </>}
      {ads.length > 0 && saved.length > 0 && <h2 className="home-yours">{t.yourAdsTitle}</h2>}
      {saved.length > 0 && <div className="home-ad-grid">{saved.map(ad => <SavedAdTile key={ad.id} ad={ad} label={ad.createdAt.slice(0, 10)} />)}</div>}
      {ads.length === 0 && saved.length === 0 && <div className="empty-state home-empty" data-testid="home-gallery-empty">
        <span className="empty-state-art" aria-hidden="true"><IconSparkles size={28} /></span>
        <h3>{t.emptyTitle}</h3>
        <p>{t.emptyLead}</p>
        <ButtonLink variant="primary" href="/oneshot">{t.cta}</ButtonLink>
      </div>}
    </section>
  </div>;
}
