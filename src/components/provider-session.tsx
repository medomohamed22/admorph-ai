'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyRoles, type Catalog, type ProviderId, type RoleSelection } from '@/lib/ai/schemas';
import { getDatabase } from '@/lib/db/dexie';
import { loadProviderSettings, saveProviderSettings } from '@/lib/db/repository';
import type { EncryptedCredential } from '@/lib/db/schema';
import { useWorkspace } from './workspace';
import { validateCustomBase } from '@/lib/ai/providers/custom';

export type ProviderConfig = { apiKey: string; baseUrl: string; consent: boolean };
type Configs = Record<ProviderId, ProviderConfig>;
export type Catalogs = Partial<Record<ProviderId, Catalog>>;
const initialConfigs = (): Configs => Object.fromEntries(['meta', 'gemini', 'openrouter', 'custom']
  .map(id => [id, { apiKey: '', baseUrl: '', consent: false }])) as Configs;

function useSessionState() {
  const workspace = useWorkspace();
  const {setStorageError} = workspace;
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [configs, setConfigs] = useState(initialConfigs);
  const [catalogs, setCatalogs] = useState<Catalogs>({});
  const [roles, setRoles] = useState<RoleSelection>(emptyRoles);
  const [savedRoles, setSavedRoles] = useState<RoleSelection | null>(null);
  const [vault, setVault] = useState<Partial<Record<ProviderId, EncryptedCredential>>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => { if (alive) { setReady(true); setStorageError(true); alive = false; } }, 5000);
    loadProviderSettings().then(data => {
      if (!alive) return;
      clearTimeout(timeout);
      if (data.settings) {
        setProvider(data.settings.provider); setRoles(data.settings.roles); setSavedRoles(data.settings.roles);
        setConfigs(previous => ({ ...previous, custom: { ...previous.custom, baseUrl: data.settings!.customBaseUrl } }));
      }
      setCatalogs(Object.fromEntries(data.catalogs.map(item => [item.providerId, {
        models: item.models, fetchedAt: item.fetchedAt, credentialStatus: 'not_tested', cached: true,
      }])));
      setVault(Object.fromEntries(data.vault.map(item => [item.providerId, item])));
      setReady(true);
    }).catch(() => { if (alive) { clearTimeout(timeout); setReady(true); setStorageError(true); } });
    return () => { alive = false; clearTimeout(timeout); };
    // State is restored once; credentials and request consent are never restored as plaintext.
  }, [setStorageError]);
  async function persistSettings(nextRoles: RoleSelection) {
    if (configs.custom.baseUrl) validateCustomBase(configs.custom.baseUrl);
    if (Object.values(nextRoles).some(value => value?.provider === 'custom')) validateCustomBase(configs.custom.baseUrl);
    if (workspace.phase !== 'ready') return false;
    try {
      await saveProviderSettings({ provider, customBaseUrl: configs.custom.baseUrl, roles: nextRoles },
        Object.entries(catalogs).map(([providerId, catalog]) => ({ providerId: providerId as ProviderId, models: catalog!.models, fetchedAt: catalog!.fetchedAt })));
      return true;
    } catch { setStorageError(true); return false; }
  }
  async function rememberCatalog(id: ProviderId, catalog: Catalog) {
    if (workspace.phase !== 'ready') return;
    try { await getDatabase().modelCatalogCache.put({ providerId: id, models: catalog.models, fetchedAt: catalog.fetchedAt }); }
    catch { setStorageError(true); }
  }
  async function forgetKey(id: ProviderId) {
    // Clear memory immediately; report any failure to remove an encrypted at-rest copy.
    setConfigs(previous => ({ ...previous, [id]: { ...previous[id], apiKey: '', consent: false } }));
    if (workspace.phase === 'ready' || vault[id]) {
      try { await getDatabase().encryptedCredentials.delete(id); }
      catch { setStorageError(true); return false; }
    }
    setVault(previous => { const copy = { ...previous }; delete copy[id]; return copy; });
    setCatalogs(previous => previous[id] ? { ...previous, [id]: { ...previous[id]!, credentialStatus: 'not_tested', cached: true } } : previous);
    return true;
  }
  async function storeEncrypted(record: EncryptedCredential) {
    if (workspace.phase !== 'ready') return false;
    try {
      await getDatabase().encryptedCredentials.put(record);
      setVault(previous => ({ ...previous, [record.providerId]: record })); return true;
    } catch { setStorageError(true); return false; }
  }
  return { provider, setProvider, configs, setConfigs, catalogs, setCatalogs, roles, setRoles, savedRoles, setSavedRoles,
    ready, vault, persistSettings, rememberCatalog, forgetKey, storeEncrypted };
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(null);
export function ProviderSession({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function useProviderSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Provider session is required');
  return session;
}
