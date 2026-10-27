'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import DesignCanvas, { type CanvasHandle } from './design-canvas';
import type { StudioData } from '@/lib/editor/set';
import { useMessages } from './workspace';
export default function CreativePreview({ entry, rtl, number }: { entry: StudioData; rtl: boolean; number: number }) {
  const m = useMessages(), s = m.creativeSet, handle = useRef<CanvasHandle | null>(null);
  const [fonts, setFonts] = useState(false), [loaded, setLoaded] = useState<Set<string>>(new Set()), [error, setError] = useState(false);
  const onReady = useCallback((id: string) => setLoaded(previous => new Set([...previous, id])), []);
  useEffect(() => { let alive = true; document.fonts.ready.then(() => Promise.all([document.fonts.load('48px Inter'), document.fonts.load('48px Cairo')])).then(() => { if (alive) setFonts(true); }).catch(() => { if (alive) setError(true); }); return () => { alive = false; }; }, []);
  const ready = fonts && entry.creative.layers.filter(layer => layer.visible && layer.assetId).every(layer => loaded.has(layer.assetId!));
  function download(caption = false) {
    try {
      const url = caption ? URL.createObjectURL(new Blob([entry.creative.caption], { type: 'text/plain;charset=utf-8' })) : handle.current!.exportPng();
      const link = document.createElement('a'); link.href = url; link.download = `admorph-${number}-${entry.creative.id}.${caption ? 'txt' : 'png'}`; link.click();
      if (caption) setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(true); }
  }
  return <><div className="creative-preview" aria-label={s.preview.replace('{number}', String(number))}>{fonts && <DesignCanvas layers={entry.creative.layers} assets={entry.assets} selected={null} select={() => {}} patch={() => {}} zoom={1} handle={handle} ready={ready} onReady={onReady} label={s.preview.replace('{number}', String(number))} rtl={rtl} disabled/>}</div>
    <p role="status">{ready ? <>{s.ready} · <bdi>1080 × 1350</bdi></> : s.preparing}</p><button className="button secondary" disabled={!ready} onClick={() => download()}>{s.download.replace('{number}', String(number))}</button>
    <button className="text-button" onClick={() => download(true)}>{s.caption}</button>{error && <p role="alert">{m.settings.errors.export_error}</p>}</>;
}
