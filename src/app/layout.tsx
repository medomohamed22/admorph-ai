import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { ProviderSession } from '@/components/provider-session';
import { Workspace, WorkspaceChrome, Footer, SkipLink } from '@/components/workspace';
import './globals.css';
import './design-system.css';
import './agent.css';
export const metadata: Metadata = { title: 'AdMorph AI — From a phone photo to a ready ad', description: 'Bilingual AI ad studio powered by three Meta models: Muse Spark, SAM 3.1 and Muse Image.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr" data-scroll-behavior="smooth"><body><Workspace><ProviderSession><SkipLink/><Header/><WorkspaceChrome/><main id="main">{children}</main><Footer/></ProviderSession></Workspace></body></html>;
}
