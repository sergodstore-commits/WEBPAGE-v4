import { Suspense } from 'react';
import SiteApp from '@/components/SiteApp';
export default function Page() {
  return (
    <Suspense fallback={<div className="initial-loading">Cargando SERGOD STORE…</div>}>
      <SiteApp />
    </Suspense>
  );
}
