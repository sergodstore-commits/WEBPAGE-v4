import type { Metadata } from 'next';
import { Suspense } from 'react';
import SiteApp from '@/components/SiteApp';
export const metadata: Metadata = {
  title: 'Beyond the Brave: todas las cartas y efectos en español',
  description:
    'Explora las 100 cartas de Beyond the Brave con búsqueda por nombre, filtros de rareza, imagen ampliada y textos en español.',
};
export default function Page() {
  return (
    <Suspense fallback={<div className="initial-loading">Cargando la edición…</div>}>
      <SiteApp />
    </Suspense>
  );
}
