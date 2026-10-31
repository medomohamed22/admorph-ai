'use client';
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useMessages } from './workspace';
import { useObjectUrl } from './logo';
import { ButtonLink } from './ui';
import { IconArrow, IconLayers, IconSparkles } from './ui/icons';
import { META_MODELS, META_MODEL_ORDER } from '@/lib/ai/models';
import { DemoStart } from './demo-tour';
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
 * The hero story in one picture: a phone takes the photo, AdMorph's three
 * Meta models work on it (cut, write, paint), and the finished ad appears as
 * a post preview. A short loop plays the sequence (flash, flow, steps light
 * up one by one, the post lands); with reduced motion it all stands still.
 * The post shows no likes or other numbers: it is a preview, not a claim.
 */
export function HeroFlow({ before, after, brand, caption, labels }: { before: string; after: string; brand: string; caption: string; labels: { before: string; after: string; cut: string; write: string; paint: string; preview: string; sponsored: string } }) {
  const handle = brand.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'yourbrand';
  const initials = brand.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'A';
  const steps = [{ model: 'sam', name: 'SAM 3.1', text: labels.cut }, { model: 'spark', name: 'Muse Spark', text: labels.write }, { model: 'image', name: 'Muse Image', text: labels.paint }];
  return <figure className="hero-flow" data-testid="hero-flow">
    <div className="hero-phone" aria-hidden="true">
      <div className="hero-phone-screen">
        <Image src={before} alt="" fill priority sizes="(max-width: 760px) 30vw, 200px" />
        <span className="hero-phone-notch" />
        <span className="hero-phone-vf"><i /><i /><i /><i /></span>
        <span className="hero-phone-shutter" />
        <span className="hero-phone-flash" />
      </div>
    </div>
    <div className="hero-flow-middle">
      <svg className="hero-flow-arrow" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="heroFlowGradient" x1="0" x2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#e26d9b" /></linearGradient></defs>
        <path className="hero-flow-path" d="M4 46 C 60 4, 140 4, 186 34" />
        <path d="M174 22 L189 36 L170 41" fill="none" stroke="#e26d9b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hero-flow-brand" dir="ltr"><span className="hero-flow-logo">A</span><b>ad</b>morph</span>
      <ol className="hero-flow-steps">{steps.map((step, index) => <li key={step.model} data-model={step.model} style={{ '--i': index } as CSSProperties}><i aria-hidden="true" /><b dir="ltr">{step.name}</b><span>{step.text}</span></li>)}</ol>
    </div>
    <div className="hero-post">
      <header><span className="hero-post-avatar" aria-hidden="true">{initials}</span><span><b dir="ltr">{handle}</b><small>{labels.sponsored}</small></span></header>
      <div className="hero-post-image"><Image src={after} alt={labels.after} fill priority sizes="(max-width: 760px) 50vw, 320px" /></div>
      <footer><span aria-hidden="true">♡ 💬 ↗</span><small>{labels.preview}</small>{caption && <p dir="auto"><b dir="ltr">{handle}</b> {caption}</p>}</footer>
    </div>
    <figcaption className="sr-only">{labels.before} → {labels.after}</figcaption>
  </figure>;
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
        <DemoStart className="home-demo" />
      </div>
      <div className="home-hero-visual">
        <HeroFlow before={showcase.hero.before} after={showcase.hero.after} brand={showcase.hero.brand ?? 'AdMorph'} caption={showcase.hero.caption ?? ''}
          labels={{ before: t.before, after: t.after, cut: t.flowCut, write: t.flowWrite, paint: t.flowPaint, preview: t.postPreview, sponsored: t.sponsored }} />
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
        <div className="home-ad-grid home-ad-grid--showcase">{ads.map(ad => <figure key={ad.src} className="home-ad" data-ratio={ad.ratio} data-testid="home-showcase-ad">
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
