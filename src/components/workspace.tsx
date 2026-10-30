'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { messages } from '@/lib/i18n';
import { getDatabase } from '@/lib/db/dexie';
import { loadWorkspace, saveBrand, removeBrand } from '@/lib/db/repository';
import { brandInputSchema, type Brand, type BrandInput, type Asset } from '@/lib/db/schema';
import { themeColors } from '@/lib/brand/theme';
import { LogoMark } from './ui/icons';

export type Locale = 'en' | 'ar';
type BrandDraft = BrandInput & { logo: Blob | null };
const DEFAULT_COLORS: BrandInput['colors'] = ['#df543a', '#dce5bb', '#62547f'];
function useWorkspaceState() {
  const [locale, updateLocale] = useState<Locale>('en');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeBrandId, updateActiveBrandId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'ephemeral'>('loading');
  const [storageError, setStorageError] = useState(false);
  const [previewColors, setPreviewColors] = useState<BrandInput['colors'] | null>(null);
  const [brandDraft, setBrandDraft] = useState<BrandDraft | null>(null);
  // A language picked before the stored workspace finished loading. It wins
  // over the stored value and is saved once storage is ready, so a quick tap
  // is neither overwritten by the load nor lost.
  const earlyLocale = useRef<Locale | null>(null);
  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => { if (alive) { setPhase('ephemeral'); setStorageError(true); alive = false; } }, 5000);
    loadWorkspace().then(data => {
      if (!alive) return;
      clearTimeout(timeout);
      const picked = earlyLocale.current;
      updateLocale(picked ?? data.locale); setBrands(data.brands); setAssets(data.assets);
      if (picked && picked !== data.locale) void getDatabase().settings.put({ key: 'locale', value: picked }).catch(() => setStorageError(true));
      updateActiveBrandId(data.activeBrandId); setPhase('ready');
    }).catch(() => { if (alive) { clearTimeout(timeout); setPhase('ephemeral'); setStorageError(true); } });
    return () => { alive = false; clearTimeout(timeout); };
  }, []);
  const activeBrand = brands.find(brand => brand.id === activeBrandId) ?? null;
  const colors = previewColors ?? activeBrand?.colors ?? DEFAULT_COLORS;
  useEffect(() => {
    const theme = themeColors(colors as BrandInput['colors']);
    const root = document.documentElement;
    root.lang = locale; root.dir = locale === 'ar' ? 'rtl' : 'ltr';
    root.style.setProperty('--coral', theme.primary);
    root.style.setProperty('--primary-fg', theme.foreground);
    root.style.setProperty('--readable-accent', theme.readableAccent);
    root.style.setProperty('--brand-secondary', theme.secondary);
    root.style.setProperty('--brand-secondary-fg', theme.secondaryForeground);
    root.style.setProperty('--brand-accent', theme.accent);
    root.style.setProperty('--brand-outline', theme.outline);
    root.style.setProperty('--brand-line', theme.accentLine);
  }, [locale, colors]);

  async function writeSetting(key: string, value: unknown) {
    if (phase !== 'ready') { setStorageError(true); return false; }
    try { await getDatabase().settings.put({ key, value }); return true; }
    catch { setStorageError(true); return false; }
  }
  function setLocale(value: Locale) {
    updateLocale(value);
    if (phase === 'loading') { earlyLocale.current = value; return; }
    void writeSetting('locale', value);
  }
  async function activateBrand(id: string | null) { updateActiveBrandId(id); return writeSetting('activeBrandId', id); }
  async function commitBrand(input: BrandInput, logo: Blob | null, previous?: Brand) {
    const data = brandInputSchema.parse(input);
    const now = new Date().toISOString();
    const asset: Asset | null = logo ? { id: crypto.randomUUID(), kind: 'logo', blob: logo, createdAt: now } : null;
    const brand: Brand = { ...data, id: previous?.id ?? crypto.randomUUID(), logoAssetId: asset?.id ?? null,
      createdAt: previous?.createdAt ?? now, updatedAt: now };
    let persisted = false;
    if (phase === 'ready') {
      try { await saveBrand(brand, asset, previous?.logoAssetId); persisted = true; }
      catch { setStorageError(true); }
    }
    setBrands(current => [brand, ...current.filter(item => item.id !== brand.id)]);
    setAssets(current => [...current.filter(item => item.id !== previous?.logoAssetId), ...(asset ? [asset] : [])]);
    updateActiveBrandId(brand.id); setPreviewColors(null);
    return { brand, persisted };
  }
  async function deleteBrand(brand: Brand) {
    if (phase === 'ready') {
      try { await removeBrand(brand.id); } catch { setStorageError(true); return false; }
    }
    setBrands(current => current.filter(item => item.id !== brand.id));
    setAssets(current => current.filter(item => item.id !== brand.logoAssetId));
    if (activeBrandId === brand.id) updateActiveBrandId(null);
    return true;
  }
  return { locale, setLocale, brands, assets, activeBrand, activateBrand, phase, storageError, setStorageError,
    previewColors, setPreviewColors, brandDraft, setBrandDraft, commitBrand, deleteBrand, writeSetting };
}
const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function Workspace({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('Workspace is required');
  return workspace;
}
export function useMessages() { return messages[useWorkspace().locale]; }
export function WorkspaceChrome() {
  const { phase, storageError } = useWorkspace(); const m = useMessages();
  const [offline,setOffline]=useState(false);
  useEffect(()=>{const update=()=>setOffline(!navigator.onLine),timer=setTimeout(update,0);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{clearTimeout(timer);window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  return <>{offline&&<p className="storage-banner" role="status">{m.meta.offline}</p>}{phase==='loading'?<p className="storage-banner" role="status">{m.common.loading}</p>:storageError?<p className="storage-banner warning" role="alert">{m.common.storageWarning}</p>:null}</>;
}
export function Footer() { const m = useMessages(); return <footer className="site-footer"><span className="brand-mark"><LogoMark size={24} /><span><b>ad</b>morph</span></span><div className="footer-meta"><p>{m.footer.notice}</p><Link className="hackathon-link" href="/hackathon">{m.hackathon.footerLink} ↗</Link></div></footer>; }
export function SkipLink() { const m = useMessages(); return <a className="skip" href="#main">{m.nav.skip}</a>; }
