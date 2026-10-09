import type { Metadata } from 'next';
import { Atkinson_Hyperlegible_Next, Fredoka, Gochi_Hand } from 'next/font/google';
import { Suspense, type ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const display = Fredoka({ subsets: ['latin'], variable: '--font-display' });
const body = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  variable: '--font-body',
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
});
const chalk = Gochi_Hand({ subsets: ['latin'], weight: '400', variable: '--font-chalk' });

export const metadata: Metadata = {
  title: 'Krito — Zicht op je leerdoelen',
  description: 'Bekijk welke Op.stap-leerdoelen je lesmateriaal ondersteunt.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={`${display.variable} ${body.variable} ${chalk.variable}`}>
      <body>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id="chalk-rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" result="rough" />
            <feComponentTransfer in="noise" result="grain">
              <feFuncA type="discrete" tableValues="0 0.55 1 1" />
            </feComponentTransfer>
            <feComposite in="rough" in2="grain" operator="in" />
          </filter>
        </svg>
        <Suspense fallback={<p className="page-loading">Even laden…</p>}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
