import { z } from 'zod';
import { getDb, type Db } from './db';
import { fail, uuid } from './core';
import {
  POS_COMPLETE_ID,
  POS_PROMO_ID,
  POS_PROMO_PRICE,
  type PosMenuItem,
  type PosMenuLine,
} from '../pos-menu';
import type { OrderItem } from '../types';

export async function getPosMenu(): Promise<PosMenuItem[]> {
  return (
    await (
      await getDb()
    ).query<PosMenuItem>(
      'SELECT id,code,name,kind,alcoholic,price,stock,version FROM pos_menu_items ORDER BY kind,name',
    )
  ).rows;
}

export async function savePosMenuStock(user: { id: string; role: string }, input: unknown) {
  if (user.role !== 'admin') fail(403, 'Esta acción requiere acceso de administrador.');
  const d = z
    .object({
      id: z.uuid(),
      stock: z.number().int().min(0).max(100000),
      expected_version: z.number().int().min(1),
    })
    .strict()
    .parse(input);
  await (
    await getDb()
  ).transaction(async (tx) => {
    const old = (
      await tx.query<PosMenuItem>('SELECT * FROM pos_menu_items WHERE id=$1 FOR UPDATE', [d.id])
    ).rows[0];
    if (!old) fail(404, 'Artículo del menú no encontrado.');
    if (old.version !== d.expected_version)
      fail(409, 'El stock cambió por una venta o edición. Recarga antes de guardar.');
    if (old.stock === d.stock) return;
    await tx.query(
      'UPDATE pos_menu_items SET stock=$2,version=version+1,updated_at=now() WHERE id=$1',
      [d.id, d.stock],
    );
    await tx.query(
      'INSERT INTO pos_menu_movements(id,item_id,actor_id,delta,reason) VALUES($1,$2,$3,$4,$5)',
      [uuid(), d.id, user.id, d.stock - old.stock, 'Ajuste manual de existencias'],
    );
  });
  return getPosMenu();
}

export async function preparePosMenuSale(tx: Db, direct: PosMenuLine[], promos: PosMenuLine[]) {
  const required = new Map<string, number>();
  const add = (id: string, quantity: number) =>
    required.set(id, (required.get(id) || 0) + quantity);
  for (const line of direct) add(line.product_id, line.quantity);
  for (const line of promos) {
    add(POS_COMPLETE_ID, line.quantity);
    add(line.product_id, line.quantity);
  }
  if (!required.size) return { items: [] as OrderItem[], deductions: [] as PosMenuLine[] };
  if ([...required.values()].some((n) => n > 100))
    fail(400, 'El máximo es 100 unidades de cada componente por ticket.');
  const rows = (
    await tx.query<PosMenuItem>(
      'SELECT * FROM pos_menu_items WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [[...required.keys()]],
    )
  ).rows;
  const menu = new Map(rows.map((item) => [item.id, item]));
  for (const [id, quantity] of required) {
    const item = menu.get(id);
    if (!item) fail(409, 'Un artículo del menú ya no está disponible.');
    if (item.stock < quantity)
      fail(
        409,
        `Solo quedan ${item.stock} unidades de ${item.name}, contando las usadas en promos.`,
      );
  }
  const complete = menu.get(POS_COMPLETE_ID);
  const items: OrderItem[] = direct.map((line) => {
    const item = menu.get(line.product_id)!;
    return {
      product_id: item.id,
      name: item.name,
      sku: `MENU-${item.code}`,
      quantity: line.quantity,
      unit_price: item.price,
      original_price: item.price,
      kind: 'pos-menu',
      image: '',
    };
  });
  for (const line of promos) {
    const beverage = menu.get(line.product_id)!;
    if (beverage.kind !== 'beverage' || beverage.alcoholic)
      fail(400, 'La promo incluye solo bebidas sin alcohol.');
    if (!complete || complete.kind !== 'food')
      fail(409, 'El completo no está disponible para preparar la promo.');
    items.push({
      product_id: POS_PROMO_ID,
      name: `Promo completo + ${beverage.name}`,
      sku: `PROMO-${beverage.code}`,
      quantity: line.quantity,
      unit_price: POS_PROMO_PRICE,
      original_price: complete.price + beverage.price,
      kind: 'pos-promo',
      image: '',
    });
  }
  return {
    items,
    deductions: [...required].map(([product_id, quantity]) => ({ product_id, quantity })),
  };
}

export async function deductPosMenu(
  tx: Db,
  deductions: PosMenuLine[],
  orderId: string,
  actorId: string,
) {
  for (const line of deductions) {
    await tx.query(
      'UPDATE pos_menu_items SET stock=stock-$2,version=version+1,updated_at=now() WHERE id=$1',
      [line.product_id, line.quantity],
    );
    await tx.query(
      'INSERT INTO pos_menu_movements(id,item_id,order_id,actor_id,delta,reason) VALUES($1,$2,$3,$4,$5,$6)',
      [uuid(), line.product_id, orderId, actorId, -line.quantity, 'Venta presencial'],
    );
  }
}
