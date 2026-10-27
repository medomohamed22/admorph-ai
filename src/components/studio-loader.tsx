'use client';
import dynamic from 'next/dynamic';
import { useMessages } from './workspace';
function Loading() { const m = useMessages(); return <p role="status">{m.studio.loading}</p>; }
const Studio = dynamic(() => import('./studio'), { ssr: false, loading: Loading });
export function StudioLoader({ campaignId }: { campaignId: string }) { return <Studio campaignId={campaignId}/>; }
