import type { MetadataRoute } from 'next';

/**
 * The web app manifest.
 *
 * This is what makes "Add to Home Screen" produce a real app rather than a
 * bookmark: without it iOS uses a screenshot of the page as the icon and
 * opens the site in Safari with its chrome on top. `display: standalone`
 * plus apple-icon gives it the Republic's own mark and a full screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Republic of FLOW',
    short_name: 'FLOW',
    description: 'A republic without borders. Discover the hidden worlds of your classmates.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0F1E34',
    theme_color: '#0F1E34',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable copy lets Android crop to its own shape without clipping
      // the mark; the roundel already sits inside a safe margin.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
