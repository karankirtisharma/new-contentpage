import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Content Creation & Media Production — Cyphernaut',
  description:
    'Cyphernaut runs the whole content engine: research, strategy, concept, script, design, production, editing, publishing, distribution, analytics and optimization — for protocols, exchanges and funds.',
  keywords: [
    'web3 content studio',
    'crypto video production',
    'motion graphics',
    'tokenomics animation',
    'podcast production',
    'content strategy',
    'creator-led marketing',
  ],
  openGraph: {
    title: 'Content Creation & Media Production — Cyphernaut',
    description: 'One line, end to end. Research through optimization.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#050607',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
