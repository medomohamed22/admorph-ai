'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { emptyRoles, type Catalog, type ProviderId, type RoleSelection } from '@/lib/ai/schemas';
import { getDatabase } from '@/lib/db/dexie';
import { loadProviderSettings, saveProviderSettings } from '@/lib/db/repository';
import type { EncryptedCredential } from '@/lib/db/schema';
import { useWorkspace } from './workspace';
import {supportEventSchema} from '@/lib/ai/meta-fetch';
import {accountContext,supportStatus,supportSchema,type MetaTask,type TaskSupport} from '@/lib/ai/task-support';
import type {ModelSelection} from '@/lib/ai/schemas';
import {selectionForTask} from '@/lib/ai/models';
import {SITE_KEY_PLACEHOLDER} from '@/lib/ai/server-key';

export type ProviderConfig = { apiKey: string; baseUrl: string; consent: boolean };
type Configs = Record<ProviderId, ProviderConfig>;
export type Catalogs = Partial<Record<ProviderId, Catalog>>;
const initialConfigs = (): Configs => Object.fromEntries(['meta', 'gemini', 'openrouter', 'custom']
  .map(id => [id, { apiKey: '', baseUrl: '', consent: false }])) as Configs;

function useSessionState() {
  const workspace = useWorkspace();
  const {setStorageError} = workspace;
  const [provider, setProvider] = useState<ProviderId>('meta');
  const [configs, setConfigs] = useState(initialConfigs);
  const [catalogs, setCatalogs] = useState<Catalogs>({});
  const [roles, setRoles] = useState<RoleSelection>(emptyRoles);
  const [savedRoles, setSavedRoles] = useState<RoleSelection | null>(null);
  const [vault, setVault] = useState<Partial<Record<ProviderId, EncryptedCredential>>>({});
  const [ready, setReady] = useState(false),[invalidRecords,setInvalidRecords]=useState(false);
  const [keyEpoch, setKeyEpoch] = useState(0), epoch = useRef(0);
  const [extraRoles,setExtraRoles]=useState<Partial<Record<MetaTask,ModelSelection>>>({});
  const [support,setSupport]=useState<TaskSupport[]>([]),[binding,setBinding]=useState({key:'',account:''});
  // The site's own key lives on the server (META_API_KEY). The browser only learns that it is there
  // and sends a placeholder the server replaces; there is no key field for visitors.
  const [siteKey, setSiteKey] = useState<'checking' | 'ready' | 'missing'>('checking');
  useEffect(() => {
    let alive = true;
    fetch('/api/site-config', { cache: 'no-store' }).then(response => response.json()).then((body: { siteKey?: unknown }) => {
      if (!alive) return;
      const ready = body.siteKey === true;
      setSiteKey(ready ? 'ready' : 'missing');
      if (ready) setConfigs(previous => ({ ...previous, meta: { ...previous.meta, apiKey: SITE_KEY_PLACEHOLDER, consent: true } }));
    }).catch(() => { if (alive) setSiteKey('missing'); });
    return () => { alive = false; };
  }, []);
  const activeAccount=binding.key===configs.meta.apiKey?binding.account:'';
  useEffect(()=>{let alive=true;const key=configs.meta.apiKey;accountContext(key).then(account=>{if(alive)setBinding({key,account:key?account:''});});return()=>{alive=false;};},[configs.meta.apiKey,keyEpoch]);
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>Promise.all([getDatabase().taskSupport.toArray(),getDatabase().settings.get('metaExtraRoles')])).then(([records,extra])=>{if(alive){setSupport(records.map(row=>supportSchema.parse(row)));if(extra)setExtraRoles(extra.value as Partial<Record<MetaTask,ModelSelection>>);}}).catch(()=>{});return()=>{alive=false;};},[]);
  // The three Meta models are fixed per task (see lib/ai/models.ts); saved role records stay readable but no longer choose models.
  function taskModel(task:MetaTask):ModelSelection{return selectionForTask(task);}
  function taskState(task:MetaTask,modelId:string){return supportStatus(support,activeAccount,modelId,task);}
  function taskProof(task:MetaTask,modelId:string){return support.find(row=>row.account===activeAccount&&row.modelId===modelId&&row.task===task&&row.status==='verified_supported'&&Date.parse(row.expiresAt)>Date.now())?.proof??'';}
  async function recordSupport(task:MetaTask,modelId:string,status:TaskSupport['status'],reason:string,proof?:string){if(!activeAccount)return;const row=supportSchema.parse({id:`${activeAccount}:${modelId}:${task}`,account:activeAccount,task,modelId,status,reason,proof,checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()});setSupport(previous=>[row,...previous.filter(item=>item.id!==row.id)]);try{await getDatabase().taskSupport.put(row);}catch{setStorageError(true);}}
  useEffect(()=>{const listener=(event:Event)=>{const parsed=supportEventSchema.safeParse((event as CustomEvent).detail);if(!parsed.success||!activeAccount||parsed.data.account!==activeAccount)return;const row=supportSchema.parse({...parsed.data,id:`${activeAccount}:${parsed.data.modelId}:${parsed.data.task}`,checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()});setSupport(previous=>[row,...previous.filter(item=>item.id!==row.id)]);void getDatabase().taskSupport.put(row).catch(()=>setStorageError(true));};window.addEventListener('admorph-meta-support',listener);return()=>window.removeEventListener('admorph-meta-support',listener);},[activeAccount,setStorageError]);
  async function saveExtra(next:typeof extraRoles){setExtraRoles(next);try{await getDatabase().settings.put({key:'metaExtraRoles',value:next});return true;}catch{setStorageError(true);return false;}}

  function lockAll() {
    epoch.current++; setKeyEpoch(epoch.current);
    setConfigs(previous => Object.fromEntries(Object.entries(previous).map(([id, config]) => [id, id === 'meta' && config.apiKey === SITE_KEY_PLACEHOLDER ? config : { ...config, apiKey: '', consent: false }])) as Configs);
    setCatalogs(previous => Object.fromEntries(Object.entries(previous).map(([id, catalog]) => [id, { ...catalog, credentialStatus: 'not_tested', cached: true }])));
  }
  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => { if (alive) { setReady(true); setStorageError(true); alive = false; } }, 5000);
    loadProviderSettings().then(data => {
      if (!alive) return;
      clearTimeout(timeout);
      setInvalidRecords(data.invalidRecords);if (data.settings) {
        setProvider('meta'); setRoles(data.settings.roles); setSavedRoles(data.settings.roles);
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
    ready,invalidRecords, siteKey, vault, persistSettings, rememberCatalog, forgetKey, storeEncrypted, keyEpoch, lockAll, currentKeyEpoch: () => epoch.current,extraRoles,saveExtra,taskModel,taskState,taskProof,recordSupport };
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
