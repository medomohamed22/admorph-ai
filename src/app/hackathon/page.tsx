import { Hackathon } from '@/components/hackathon';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Hackathon build log' };
export default function Page() { return <Hackathon/>; }
