import type { Product } from './types';

export type PreorderState = 'upcoming' | 'open' | 'closed' | 'sold-out' | 'unconfigured';

export const preorderLabels: Record<PreorderState, string> = {
  upcoming: 'Próximamente',
  open: 'Reserva abierta',
  closed: 'Preventa finalizada',
  'sold-out': 'Cupos agotados',
  unconfigured: 'Fechas por confirmar',
};

export function preorderState(
  product: Pick<Product, 'opens_at' | 'closes_at' | 'available'>,
  now = Date.now(),
): PreorderState {
  const opens = product.opens_at ? Date.parse(product.opens_at) : NaN;
  const closes = product.closes_at ? Date.parse(product.closes_at) : NaN;
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || opens >= closes) return 'unconfigured';
  if (now < opens) return 'upcoming';
  if (now >= closes) return 'closed';
  return product.available > 0 ? 'open' : 'sold-out';
}

// A family can contain different dates and delivery terms for each format/language.
// Only present shared information as a family-wide condition.
export function preorderFamily(products: Product[], now = Date.now()) {
  const states = products.map((product) => preorderState(product, now));
  const state = states.includes('open')
    ? 'open'
    : states.every((value) => value === states[0])
      ? states[0]
      : null;
  const common = (key: 'opens_at' | 'closes_at' | 'delivery_terms') => {
    const value = products[0]?.[key];
    return value && products.every((product) => product[key] === value) ? value : null;
  };
  return {
    state,
    label: state ? preorderLabels[state] : 'Consulta las opciones',
    opensAt: common('opens_at'),
    closesAt: common('closes_at'),
    deliveryTerms: common('delivery_terms'),
    available: products.reduce(
      (sum, product, index) => sum + (states[index] === 'open' ? product.available : 0),
      0,
    ),
  };
}
