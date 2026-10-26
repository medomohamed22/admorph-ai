'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMessages, useWorkspace } from './workspace';
import { useProviderSession } from './provider-session';
import { getDatabase } from '@/lib/db/dexie';
export function StorageControls() {
  const m = useMessages(), s = m.storage; const workspace = useWorkspace(); const session = useProviderSession();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [status, setStatus] = useState<'granted' | 'denied' | 'unsupported' | 'cacheCleared' | null>(null);
  async function refresh() { try { setEstimate(await navigator.storage.estimate()); } catch { setEstimate(null); } }
  useEffect(() => { let alive = true; navigator.storage?.estimate?.().then(value => { if (alive) setEstimate(value); }).catch(() => {}); return () => { alive = false; }; }, []);
  async function persist() {
    try { setStatus(await navigator.storage.persist() ? 'granted' : 'denied'); }
    catch { setStatus('unsupported'); }
  }
  async function clearCatalogs() {
    try { await getDatabase().modelCatalogCache.clear(); session.setCatalogs({}); setStatus('cacheCleared'); }
    catch { workspace.setStorageError(true); }
  }
  const number = (value: number) => new Intl.NumberFormat(workspace.locale, { maximumFractionDigits: 2 }).format(value / 1024 / 1024);
  return <section id="setting-3" className="settings-card"><h2>{s.title}</h2><p>{s.note}</p><p>{s.perOrigin}</p><div className="storage-usage"><strong>{s.usage}</strong><p>{estimate?.usage !== undefined ? `${number(estimate.usage)} ${s.megabytes}${estimate.quota ? ` / ${number(estimate.quota)} ${s.megabytes} ${s.of}` : ''}` : s.unknown}</p></div><div className="field-actions"><button className="button secondary" onClick={() => void refresh()}>{s.refresh}</button><button className="button secondary" onClick={() => void persist()}>{s.request}</button><button className="button secondary" onClick={() => void clearCatalogs()}>{s.clearCatalogs}</button></div><p>{s.backupNote}</p><Link className="button secondary" href="/brands">{s.library} ↗</Link>{status && <p role="status">{s[status]}</p>}</section>;
}
