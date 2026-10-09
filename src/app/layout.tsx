import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Krito — Zicht op je leerdoelen',
  description: 'Bekijk welke Op.stap-leerdoelen je lesmateriaal ondersteunt.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="nl"><body><Suspense fallback={<p>Even laden…</p>}><Providers>{children}</Providers></Suspense></body></html>;
}
