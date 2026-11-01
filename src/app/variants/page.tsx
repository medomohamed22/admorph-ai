import { Suspense } from 'react';
import AdRemixStudio from '@/components/ad-remix-studio';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Ad variants' };

export default function Page() {
  return <Suspense><main className="remix-page"><AdRemixStudio mode="variants" /></main></Suspense>;
}
