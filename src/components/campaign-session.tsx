'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { newCampaign, type Campaign } from '@/lib/campaign/schema';
import { loadCampaigns, saveCampaign } from '@/lib/campaign/repository';
import type { Asset } from '@/lib/db/schema';
import { useWorkspace } from './workspace';

function useCampaignState() {
  const { setStorageError } = useWorkspace();
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<'draft' | 'saved' | 'saving' | 'error'>('draft');
  const [revision, setRevision] = useState(0);
  const version = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const created = useRef(new Set<string>());
  const fresh = useCallback(() => { const next = newCampaign(); created.current.add(next.id); return next; }, []);
  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => { if (alive) { alive = false; setDraft(fresh()); setReady(true); setSaveState('error'); setStorageError(true); } }, 5000);
    loadCampaigns().then(data => {
      if (!alive) return;
      clearTimeout(timeout); setCampaigns(data.campaigns); setAssets(data.assets);
      const restored = data.campaigns.find(item => item.id === data.activeId);
      setDraft(restored ?? fresh()); setSaveState(restored ? 'saved' : 'draft'); setReady(true);
    }).catch(() => { if (alive) { clearTimeout(timeout); setDraft(fresh()); setReady(true); setSaveState('error'); setStorageError(true); } });
    return () => { alive = false; clearTimeout(timeout); };
  }, [setStorageError, fresh]);
  const asset = assets.find(item => item.id === draft?.productAssetId) ?? null;
  function update(next: Campaign) {
    setDraft({ ...next, updatedAt: new Date().toISOString() });
    version.current += 1; setRevision(version.current); setSaveState('saving');
  }
  function remember(next: Campaign) { setCampaigns(previous => [next, ...previous.filter(item => item.id !== next.id)]); }
  function persist(next: Campaign, nextAsset: Asset | null, capturedVersion: number) {
    remember(next);
    const write = queue.current.catch(() => {}).then(() => saveCampaign(next, nextAsset));
    queue.current = write;
    return write.then(() => { if (version.current === capturedVersion) setSaveState('saved'); return true; })
      .catch(() => { if (version.current === capturedVersion) setSaveState('error'); setStorageError(true); return false; });
  }
  useEffect(() => {
    if (!ready || !draft || revision === 0) return;
    const timer = setTimeout(() => { void persist(draft, asset, revision); }, 450);
    return () => clearTimeout(timer);
    // Each revision captures a complete draft and its associated Blob; writes are serialized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draft, asset, revision]);
  async function flush() { return draft ? persist(draft, asset, version.current) : false; }
  function replaceProduct(blob: Blob, next: Campaign = draft!) {
    const product: Asset = { id: crypto.randomUUID(), kind: 'product', blob, createdAt: new Date().toISOString() };
    setAssets(previous => [...previous, product]);
    update({ ...next, productAssetId: product.id, originalProductAssetId:product.id,activeVariantId:null,inputRevision: next.inputRevision + 1, concepts: next.concepts.map(item => ({ ...item, approved: false })) });
  }
  function chooseProduct(asset:Asset,variantId:string|null,originalId:string){if(!draft)return;setAssets(previous=>[asset,...previous.filter(item=>item.id!==asset.id)]);update({...draft,productAssetId:asset.id,originalProductAssetId:originalId,activeVariantId:variantId,inputRevision:draft.inputRevision+1,concepts:draft.concepts.map(item=>({...item,approved:false}))});}
  async function select(id?: string) {
    await flush();
    const next = id ? campaigns.find(item => item.id === id) : fresh();
    if (next) update(next);
  }
  return { draft, asset, assets, campaigns, ready, saveState, update, replaceProduct,chooseProduct,flush, select, isNewCampaign: (id: string) => created.current.has(id) };
}
const CampaignContext = createContext<ReturnType<typeof useCampaignState> | null>(null);
export function CampaignSession({ children }: { children: ReactNode }) { return <CampaignContext.Provider value={useCampaignState()}>{children}</CampaignContext.Provider>; }
export function useCampaign() { const state = useContext(CampaignContext); if (!state) throw new Error('CampaignSession missing'); return state; }
