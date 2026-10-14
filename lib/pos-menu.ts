export type PosMenuItem = {
  id: string;
  code: string;
  name: string;
  kind: 'beverage' | 'food';
  alcoholic: boolean;
  price: number;
  stock: number;
  version: number;
};
export type PosMenuLine = { product_id: string; quantity: number };
export type PosTicketProduct = Pick<
  import('./types').Product,
  'id' | 'name' | 'sku' | 'price' | 'discount_percent' | 'available' | 'images'
> & { menu_id?: string; promo_beverage_id?: string };
export type PosTicketLine = { product: PosTicketProduct; quantity: number };
export const POS_COMPLETE_ID = 'b1388400-8979-4000-8000-000000000011';
export const POS_PROMO_ID = 'b1388400-8979-4000-8000-000000000012';
export const POS_PROMO_PRICE = 3000;
export function posMenuRemaining(menu: PosMenuItem[], ticket: PosTicketLine[]) {
  const remaining = new Map(menu.map((item) => [item.id, item.stock]));
  const subtract = (id: string, quantity: number) =>
    remaining.set(id, (remaining.get(id) || 0) - quantity);
  for (const line of ticket) {
    if (line.product.menu_id) subtract(line.product.menu_id, line.quantity);
    if (line.product.promo_beverage_id) {
      subtract(POS_COMPLETE_ID, line.quantity);
      subtract(line.product.promo_beverage_id, line.quantity);
    }
  }
  return remaining;
}
export function posTicketCapacity(
  product: PosTicketProduct,
  menu: PosMenuItem[],
  ticket: PosTicketLine[],
) {
  const current = ticket.find((line) => line.product.id === product.id)?.quantity || 0;
  const remaining = posMenuRemaining(menu, ticket);
  const free = product.menu_id
    ? remaining.get(product.menu_id) || 0
    : product.promo_beverage_id
      ? Math.min(remaining.get(POS_COMPLETE_ID) || 0, remaining.get(product.promo_beverage_id) || 0)
      : product.available - current;
  return Math.min(100, current + Math.max(0, free));
}
export const posDeliverySlots = {
  now: 'Ahora',
  'current-round': 'Durante la ronda actual',
  round2: 'En la ronda 2',
} as const;
