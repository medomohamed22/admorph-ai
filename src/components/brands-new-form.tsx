'use client';
import { useSearchParams } from 'next/navigation';
import { BrandForm } from './brand-kit';

/** Reads ?returnTo= on the client so /brands/new stays prerenderable. */
export default function BrandsNewForm() {
  const params = useSearchParams();
  return <BrandForm returnTo={params.get('returnTo') ?? undefined} />;
}
