import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sweet Rascal',
    short_name: 'Sweet Rascal',
    description: 'Restaurant billing and service for Sweet Rascal, Yercaud.',
    start_url: '/#overview',
    scope: '/',
    display: 'standalone',
    background_color: '#f9f5f2',
    theme_color: '#75201d',
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
