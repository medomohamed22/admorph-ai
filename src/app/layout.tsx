import type { Metadata, Viewport } from 'next';
import { Header } from '@/components/header';
import { ProviderSession } from '@/components/provider-session';
import { DemoTour } from '@/components/demo-tour';
import { Workspace, WorkspaceChrome, Footer, SkipLink } from '@/components/workspace';
import './globals.css';
import './design-system.css';
import './agent.css';
import './wizard.css';
import './home.css';
import './shelf.css';
import './brand-extract.css';
import './generate.css';
import './remix.css';
import './demo.css';
const description = 'Turn one phone photo into a finished Instagram ad in a minute, in your dialect. Built on three Meta models: Muse Spark, SAM 3.1 and Muse Image.';
export const metadata: Metadata = {
  metadataBase: new URL('https://admorph-ai-app.vercel.app'),
  title: { default: 'AdMorph AI — From a phone photo to a ready ad', template: '%s · AdMorph AI' },
  description,
  applicationName: 'AdMorph AI',
  openGraph: { type: 'website', siteName: 'AdMorph AI', title: 'AdMorph AI — From a phone photo to an Instagram ad in a minute', description, url: '/', locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: 'AdMorph AI — From a phone photo to an Instagram ad in a minute', description },
};
export const viewport: Viewport = { themeColor: '#0b0a10' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr" data-scroll-behavior="smooth"><body><Workspace><ProviderSession><SkipLink/><Header/><WorkspaceChrome/><DemoTour><main id="main">{children}</main></DemoTour><Footer/></ProviderSession></Workspace></body></html>;
}
