import { Suspense } from 'react';
import OneshotStudio from '@/components/oneshot-studio';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'One-shot ad studio' };

export default function Page() {
  return <Suspense><OneshotStudio /></Suspense>;
}
