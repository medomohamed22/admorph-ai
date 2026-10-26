'use client';
import Link from 'next/link';
import { useMessages } from '@/components/workspace';
export default function NotFound() {
  const m = useMessages();
  return <section className="shell-page"><span>404</span><h1>{m.common.notFound}</h1><p>{m.common.notFoundNote}</p><Link className="button primary" href="/">{m.common.backHome}</Link></section>;
}
