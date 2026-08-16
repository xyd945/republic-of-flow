import type { Metadata, Viewport } from 'next';
import { EB_Garamond, Cinzel, Noto_Serif_SC, Caveat } from 'next/font/google';
import './globals.css';

// These deliberately do NOT reuse the design-token names (--font-serif etc.).
// next/font emits `--font-x: "Family", "Family Fallback"` and would overwrite
// the token, throwing away the CJK and Georgia tiers of the stack — which left
// every Chinese glyph rendering in a substitute face. globals.css composes the
// real stacks from these single-family variables instead.
const garamond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-garamond',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Republic of FLOW',
  description: 'A republic without borders. Discover the hidden worlds of your classmates.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${garamond.variable} ${cinzel.variable} ${notoSerifSC.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
