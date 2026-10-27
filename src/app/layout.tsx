import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { ProviderSession } from '@/components/provider-session';
import { Workspace, WorkspaceChrome, Footer, SkipLink } from '@/components/workspace';
import './globals.css';
import { CampaignSession } from '@/components/campaign-session';
import { StudioSession } from '@/components/studio-session';
export const metadata: Metadata = { title: 'AdMorph AI — A world of possibilities', description: 'A bilingual creative playground with local Brand Kits and your own provider setup.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr" data-scroll-behavior="smooth"><body><Workspace><ProviderSession><CampaignSession><StudioSession><SkipLink/><Header/><WorkspaceChrome/><main id="main">{children}</main><Footer/></StudioSession></CampaignSession></ProviderSession></Workspace></body></html>;
}
