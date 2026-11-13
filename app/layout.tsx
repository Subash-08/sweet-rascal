import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geist = localFont({
  src: '../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2',
  weight: '100 900',
  variable: '--font-geist',
  display: 'swap',
});
const playfair = localFont({
  src: '../node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2',
  weight: '400 900',
  style: 'italic',
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sweet Rascal | Restaurant Billing',
  description: 'Dining orders, guests and billing for Sweet Rascal, Yercaud.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN" className={geist.variable + ' ' + playfair.variable}><body>{children}</body></html>;
}
