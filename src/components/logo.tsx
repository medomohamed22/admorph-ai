'use client';
import { useState } from 'react';
export function useObjectUrl(blob: Blob | null) {
  // Synchronous: the URL updates in the same commit as the blob, so a
  // preview or canvas image never shows the previous blob for a frame —
  // and never decodes a URL that a later cleanup already revoked. This
  // uses React's render-phase state adjustment (the documented derived
  // state pattern): the intermediate render is discarded, the committed
  // render always carries the new URL. A replaced URL is revoked at once;
  // the current URL lives until replaced or the page unloads, bounded by
  // the blobs the app already holds in state.
  const [cached, setCached] = useState<{ blob: Blob | null; url: string | null }>({ blob: null, url: null });
  if (cached.blob !== blob) {
    if (cached.url) URL.revokeObjectURL(cached.url);
    setCached({ blob, url: blob ? URL.createObjectURL(blob) : null });
  }
  return cached.url;
}
export function Logo({ blob, alt }: { blob: Blob | null; alt: string }) {
  const url = useObjectUrl(blob);
  // Local validated Blob URLs cannot use the server image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="brand-logo"/> : <span className="logo-placeholder" aria-hidden="true">✳</span>;
}
