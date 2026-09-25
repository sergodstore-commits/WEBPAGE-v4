import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'SERGOD STORE · Cartas y comunidad en Copiapó', template: '%s · SERGOD STORE' },
  description:
    'Tienda de cartas coleccionables en Copiapó, Chile. Catálogo, preventas, noticias, comunidad y torneos.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
