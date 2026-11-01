import { Suspense } from 'react';
import BrandsNewForm from '@/components/brands-new-form';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'New brand kit' };

export default function Page() {
  return <Suspense><BrandsNewForm /></Suspense>;
}
