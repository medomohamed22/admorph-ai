import { Suspense } from 'react';
import AdRemixStudio from '@/components/ad-remix-studio';

export default function Page() {
  return <Suspense><AdRemixStudio mode="variants" /></Suspense>;
}
