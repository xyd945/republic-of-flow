import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * The bitmap faces are loaded with a plain <link>, not next/font.
 *
 * Two reasons, both learned here. next/font emits its own `--font-*` CSS
 * variables and would overwrite the type tokens in globals.css — that is
 * exactly how the CJK tier of the old stack got clobbered, leaving every
 * Chinese glyph in a substitute face. And a CSS `@import` cannot be used
 * either: `@import "tailwindcss"` expands inline, so any import after it lands
 * mid-stylesheet and fails to parse, while an import before it is fragile to
 * reorder later. A link in the head is immune to both.
 *
 * PIXEL RULE: these faces are only ever rendered at 8/10/12/16/24/32px.
 * A fractional size puts the glyph off the pixel grid and it turns to mush.
 */
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700' +
  '&family=Pixelify+Sans:wght@400;500;600;700' +
  '&family=DotGothic16' +
  '&family=Press+Start+2P' +
  '&display=swap';

export const metadata: Metadata = {
  title: 'Republic of FLOW',
  description: 'A republic without borders. Discover the hidden worlds of your classmates.',
  manifest: '/manifest.webmanifest',
  /* Next picks up src/app/icon.png and src/app/apple-icon.png by file
     convention; naming them here as well keeps the tags stable if those files
     are ever moved. */
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'FLOW',
    // The bar sits over the navy masthead, so it must not paint its own ground.
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F1E34',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_HREF} />
      </head>
      <body>{children}</body>
    </html>
  );
}
