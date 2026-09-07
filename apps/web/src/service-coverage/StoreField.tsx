import type { StoreSummary } from './store.js';

export function StoreField({
  loading = false,
  name = 'branchId',
  store,
}: {
  readonly loading?: boolean;
  readonly name?: string;
  readonly store: StoreSummary | null;
}) {
  return (
    <div aria-label="Tienda configurada" className="store-context">
      <input name={name} type="hidden" value={store?.branchId ?? ''} />
      <span>Tienda</span>
      <strong>{loading ? 'Cargando…' : (store?.name ?? 'No configurada')}</strong>
      {store?.publicAddress ? <small>{store.publicAddress}</small> : null}
      {store?.openingHours ? <small>{store.openingHours}</small> : null}
    </div>
  );
}
