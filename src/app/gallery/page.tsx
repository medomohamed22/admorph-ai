import AdGallery from '@/components/ad-gallery';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'My gallery' };

export default function Page() {
  return <AdGallery />;
}
