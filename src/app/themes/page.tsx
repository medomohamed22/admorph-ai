import { Suspense } from 'react';
import AdRemixStudio from '@/components/ad-remix-studio';

export default function Page() {
  return <Suspense><main className="remix-page"><AdRemixStudio mode="themes" /></main></Suspense>;
}
