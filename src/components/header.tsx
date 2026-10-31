'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { useMessages, useWorkspace } from './workspace';
import { IconLayers, IconPalette, IconSettings, IconSparkles, LogoMark } from './ui/icons';
import { useSlidingIndicator } from './ui';

type NavItem = { href: string; label: string; icon: React.ReactNode; active: (path: string) => boolean };

export function Header() {
  const m = useMessages();
  const { locale, setLocale } = useWorkspace();
  const path = usePathname();
  const topRef = useRef<HTMLElement>(null), bottomRef = useRef<HTMLElement>(null);
  const items: NavItem[] = [
    { href: '/oneshot', label: m.nav.createAd, icon: <IconSparkles size={16} />, active: p => p.startsWith('/oneshot') || p.startsWith('/shelf') },
    { href: '/gallery', label: m.nav.gallery, icon: <IconLayers size={16} />, active: p => ['/gallery', '/variants', '/themes'].some(prefix => p.startsWith(prefix)) },
    { href: '/brands', label: m.nav.brands, icon: <IconPalette size={16} />, active: p => p.startsWith('/brands') },
    { href: '/settings', label: m.nav.settings, icon: <IconSettings size={16} />, active: p => p === '/settings' },
  ];
  const topPill = useSlidingIndicator(topRef, 'a[aria-current=page]', [path, locale]);
  const bottomPill = useSlidingIndicator(bottomRef, 'a[aria-current=page]', [path, locale]);
  return (
    <>
    <header className="site-header">
      <Link href="/" className="brand-mark" aria-label={m.nav.home}><LogoMark /><span><b>ad</b>morph</span><sup>AI</sup></Link>
        <nav ref={topRef} className="site-nav" aria-label={m.nav.main}>
          <span className="nav-pill slide-indicator" style={topPill} aria-hidden="true" />
          {items.map(item => {
            const active = item.active(path);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                {item.icon}<span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      <div className="header-actions">
        <button type="button" className="chip-button" aria-label={m.nav.switchLanguage} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
          {locale === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>
    </header>
        <nav ref={bottomRef} className="bottom-nav" aria-label={m.nav.main}>
          <span className="nav-pill slide-indicator" style={bottomPill} aria-hidden="true" />
          {items.map(item => {
            const active = item.active(path);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                {item.icon}<span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
    </>
  );
}
