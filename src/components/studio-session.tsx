'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { compose } from '@/lib/editor/composition';
import { creativeSchema, clampLayer, type Creative, type EditableLayer } from '@/lib/editor/schema';
import { dimensionsFor } from '@/lib/editor/sizes';
import { loadCreative, saveCreative } from '@/lib/editor/repository';
import type { Campaign, EditableConcept } from '@/lib/campaign/schema';
import type { Asset } from '@/lib/db/schema';
import { useWorkspace } from './workspace';
import { fingerprint } from '@/lib/critic/rules';
import { persistRepair } from '@/lib/repair/repository';
import type { RepairReceipt } from '@/lib/repair/schema';
import { buildCreativeSet, readCreativeSet, saveCreativeSet, type StudioData } from '@/lib/editor/set';
function useStudioState() {
  const { setStorageError } = useWorkspace();
  const [creative, setCreative] = useState<Creative | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saving');
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<Creative[]>([]), [future, setFuture] = useState<Creative[]>([]);
  const cache = useRef(new Map<string, { creative: Creative; assets: Asset[] }>());
  const currentKey = useRef<string | null>(null);
  const version = useRef(0), opening = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [, refreshSets] = useState(0);
  const listSet = (campaign: Campaign) => campaign.concepts.flatMap(concept => { const entry = cache.current.get(`${campaign.id}:${concept.id}`); return entry ? [entry] : []; });
  const restoreSet = useCallback(async (campaign: Campaign) => {
    const entries = await readCreativeSet(campaign);
    for (const entry of entries) { const key = `${campaign.id}:${entry.creative.conceptId}`; if (!cache.current.has(key)) cache.current.set(key, entry); }
    refreshSets(value => value + 1);
  }, []);
  async function prepareSet(campaign: Campaign, product: Asset, logo: Asset | null, isNewCampaign: boolean) {
    const write = writes.current.catch(() => {}).then(async () => {
      let disk: StudioData[] = [];
      try { disk = await readCreativeSet(campaign); } catch { if (!isNewCampaign) throw new Error('storage_unavailable'); }
      const cached = listSet(campaign), entries = buildCreativeSet(campaign, product, logo, [...cached, ...disk]);
      let persisted = true;
      try { await saveCreativeSet(entries); } catch { persisted = false; setStorageError(true); }
      for (const entry of entries) { const key = `${campaign.id}:${entry.creative.conceptId}`, current = cache.current.get(key), previous = cached.find(item => item.creative.conceptId === entry.creative.conceptId); if (!current || current === previous) cache.current.set(key, entry); }
      refreshSets(value => value + 1); return persisted;
    });
    writes.current = write; return write;
  }
  const open = useCallback(async (campaign: Campaign, concept: EditableConcept, product: Asset, logo: Asset | null, allowCreate = true) => {
    const token = ++opening.current; const key = `${campaign.id}:${concept.id}`;
    const previous = currentKey.current ? cache.current.get(currentKey.current) : null;
    if (previous && currentKey.current !== key) {
      const flush = writes.current.catch(() => {}).then(() => saveCreative(previous.creative, previous.assets));
      writes.current = flush; void flush.catch(() => setStorageError(true));
    }
    currentKey.current = key;
    let data = cache.current.get(key); let failed = false;
    if (!data) {
      try { data = await Promise.race([loadCreative(campaign.id, concept.id), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('storage_timeout')), 5000))]) ?? undefined; }
      catch { failed = true; setStorageError(true); }
    }
    if (token !== opening.current) return;
    if (!data) {
      if (!allowCreate) return;
      // Copy source assets so replacing a campaign photo cannot break an existing creative.
      const ownedProduct = { ...product, id: crypto.randomUUID() };
      const ownedLogo = logo ? { ...logo, id: crypto.randomUUID() } : null;
      data = { creative: compose(campaign, concept, ownedProduct.id, ownedLogo?.id ?? null), assets: [ownedProduct, ...(ownedLogo ? [ownedLogo] : [])] };
    }
    cache.current.set(key, data); setCreative(data.creative); setAssets(data.assets); setHistory([]); setFuture([]);
    version.current++; setRevision(version.current); setSaveState(failed ? 'error' : 'saving');
  }, [setStorageError]);
  function update(next: Creative, nextAssets = assets, record = true) {
    const valid = creativeSchema.parse({ ...next, updatedAt: new Date().toISOString() });
    if (record && creative) { setHistory(previous => [...previous.slice(-29), creative]); setFuture([]); }
    cache.current.set(`${valid.campaignId}:${valid.conceptId}`, { creative: valid, assets: nextAssets });
    setCreative(valid); setAssets(nextAssets); version.current++; setRevision(version.current); setSaveState('saving');
  }
  function patch(id: string, values: Partial<EditableLayer>) { if (creative) update({ ...creative, layers: creative.layers.map(layer => layer.id === id ? clampLayer(layer, values, dimensionsFor(creative.format)) : layer) }); }
  function persist(snapshot: Creative, snapshotAssets: Asset[], captured: number) {
    const write = writes.current.catch(() => {}).then(() => saveCreative(snapshot, snapshotAssets)); writes.current = write;
    return write.then(() => { if (version.current === captured) setSaveState('saved'); return true; })
      .catch(() => { if (version.current === captured) setSaveState('error'); setStorageError(true); return false; });
  }
  useEffect(() => {
    if (!creative || !revision) return;
    const timeout = setTimeout(() => { void persist(creative, assets, revision); }, 400);
    return () => clearTimeout(timeout);
    // A revision captures metadata and Blobs together. Writes are serialized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creative, assets, revision]);
  // A reload or navigation inside the 400ms debounce window must not drop
  // the latest edit: flush the pending snapshot on pagehide (reload/close)
  // and on unmount (client-side navigation away from the studio). The manual
  // Save-now button and concept switcher already flush; this covers the paths
  // where the user never clicks them.
  const latest = useRef<{ creative: Creative | null; assets: Asset[]; revision: number }>({ creative: null, assets: [], revision: 0 });
  useEffect(() => { latest.current = { creative, assets, revision }; });
  useEffect(() => {
    const flush = () => { const snap = latest.current; if (snap.creative && snap.revision) void persist(snap.creative, snap.assets, snap.revision); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function background(blob: Blob, source: 'gemini' | 'meta' | 'local', model: Creative['model']) {
    const active = currentKey.current ? cache.current.get(currentKey.current) : null;
    if (!creative || active?.creative.id !== creative.id) return;
    const asset: Asset = { id: crypto.randomUUID(), kind: 'background', blob, createdAt: new Date().toISOString() };
    update({ ...creative, source, model, layers: creative.layers.map(layer => layer.kind === 'background' ? { ...layer, assetId: asset.id } : layer) }, [...assets, asset]);
  }
  /** Swap the product layer to a cutout asset (original stays in assets). */
  function replaceProductLayer(asset: Asset) {
    if (!creative) return false;
    const layer = creative.layers.find(item => item.kind === 'product');
    if (!layer || layer.assetId === asset.id) return false;
    update({ ...creative, layers: creative.layers.map(item => item.kind === 'product' ? { ...item, assetId: asset.id } : item) }, [...assets, asset]);
    return true;
  }
  /** Save an AI reference image: recorded on the creative, never a layer. */
  function setReference(blob: Blob) {
    if (!creative) return;
    const asset: Asset = { id: crypto.randomUUID(), kind: 'reference', blob, createdAt: new Date().toISOString() };
    update({ ...creative, referenceAssetId: asset.id }, [...assets, asset]);
  }
  function undo() { const last = history.at(-1); if (!creative || !last) return; setHistory(history.slice(0, -1)); setFuture([creative, ...future]); update(last, assets, false); }
  function redo() { const next = future[0]; if (!creative || !next) return; setHistory([...history, creative]); setFuture(future.slice(1)); update(next, assets, false); }
  async function applyRepair(record: RepairReceipt) {
    const current = currentKey.current ? cache.current.get(currentKey.current) : null;
    if (!current || fingerprint(current.creative) !== fingerprint(record.before)) return { applied: false, persisted: false };
    update(record.after, current.assets);
    const captured = version.current;
    const write = writes.current.catch(() => {}).then(() => persistRepair(record, current.assets)); writes.current = write;
    const persisted = await write.then(() => true).catch(() => { setStorageError(true); return false; });
    if (version.current === captured) setSaveState(persisted ? 'saved' : 'error');
    return { applied: true, persisted };
  }
  function restoreRepair(expected: string, snapshot: Creative) {
    const current = currentKey.current ? cache.current.get(currentKey.current) : null;
    if (!current || fingerprint(current.creative) !== expected) return false;
    update(snapshot, current.assets); return true;
  }
  return { creative, assets, saveState, open, patch, update, background, replaceProductLayer, setReference, undo, redo, canUndo: !!history.length, canRedo: !!future.length,
    applyRepair, restoreRepair, listSet, restoreSet, prepareSet, flush: () => creative ? persist(creative, assets, version.current) : Promise.resolve(false) };
}
const StudioContext = createContext<ReturnType<typeof useStudioState> | null>(null);
export function StudioSession({ children }: { children: ReactNode }) { return <StudioContext.Provider value={useStudioState()}>{children}</StudioContext.Provider>; }
export function useStudio() { const state = useContext(StudioContext); if (!state) throw new Error('StudioSession missing'); return state; }
