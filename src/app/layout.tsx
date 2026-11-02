import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
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
/**
 * A visitor who picked Arabic gets it on reload without the page first showing
 * English and then flipping by itself: the saved choice (a two-letter mirror of
 * the IndexedDB setting) sets the direction before paint, and the page stays
 * hidden only until the workspace has applied it (at most 1.5 seconds).
 */
const LOCALE_BOOT = "try{if(localStorage.getItem('admorph-locale')==='ar'){var d=document.documentElement;d.lang='ar';d.dir='rtl';d.setAttribute('data-locale-pending','');setTimeout(function(){d.removeAttribute('data-locale-pending')},1500)}}catch(e){}";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT }} /></head><body><Workspace><ProviderSession><SkipLink/><Header/><WorkspaceChrome/><DemoTour><main id="main">{children}</main></DemoTour><Footer/></ProviderSession></Workspace><Analytics/></body></html>;
}
