import { Suspense } from 'react';
import AdRemixStudio from '@/components/ad-remix-studio';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Seasonal themes' };

export default function Page() {
  return <Suspense><main className="remix-page"><AdRemixStudio mode="themes" /></main></Suspense>;
}
