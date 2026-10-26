'use client';
import { useEffect, useState } from 'react';
export function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const next = blob ? URL.createObjectURL(blob) : null;
    Promise.resolve().then(() => { if (alive) setUrl(next); });
    return () => { alive = false; if (next) URL.revokeObjectURL(next); };
  }, [blob]);
  return url;
}
export function Logo({ blob, alt }: { blob: Blob | null; alt: string }) {
  const url = useObjectUrl(blob);
  // Local validated Blob URLs cannot use the server image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="brand-logo"/> : <span className="logo-placeholder" aria-hidden="true">✳</span>;
}
