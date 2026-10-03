import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import '@/styles/tokens.css';

const inter = localFont({
  src: '../public/fonts/inter-latin-variable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});
const barlow = localFont({
  src: [
    { path: '../public/fonts/barlow-condensed-latin-700.woff2', weight: '700' },
    { path: '../public/fonts/barlow-condensed-latin-800.woff2', weight: '800' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});
export const metadata: Metadata = {
  title: { default: 'SERGOD STORE · Cartas y comunidad en Copiapó', template: '%s · SERGOD STORE' },
  description:
    'Tienda de cartas coleccionables en Copiapó, Chile. Catálogo, preventas, noticias, comunidad y torneos.',
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-CL"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${barlow.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
