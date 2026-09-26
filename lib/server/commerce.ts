import { z } from 'zod';
import { getDb, type Db } from './db';
import { appUrl, event, fail, flowEnvironment, hash, integer, publicOrder, uuid } from './core';
import { enqueueMail } from './mail';
import type { OrderItem, Settings } from '../types';
const itemsSchema = z
  .array(z.object({ product_id: z.uuid(), quantity: z.number().int().min(1).max(100) }))
  .min(1, 'Tu carrito está vacío.')
  .max(100);
const deliverySchema = z.object({
  method: z.enum(['pickup', 'shipping']),
  carrier_id: z.string().max(80).optional(),
  recipient: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  commune: z.string().trim().max(100).optional(),
  region: z.string().trim().max(100).optional(),
  address: z.string().trim().max(400).optional(),
  agency: z.string().trim().max(300).optional(),
});
const checkoutSchema = z.object({
  items: itemsSchema,
  delivery: deliverySchema,
  idempotency_key: z.uuid(),
});
const posSchema = z.object({
  items: itemsSchema,
  payment_method: z.enum(['cash', 'card', 'transfer', 'other']),
  cash_received: integer.optional(),
  customer_name: z.string().trim().max(120).optional(),
  idempotency_key: z.uuid(),
});
function aggregate(items: { product_id: string; quantity: number }[]) {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.product_id, (map.get(i.product_id) || 0) + i.quantity);
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([product_id, quantity]) => {
      if (quantity > 100)
        fail(400, 'Puedes comprar como máximo 100 unidades de cada artículo por pedido.');
      return { product_id, quantity };
    });
}
async function existing(tx: Db, key: string, fingerprint: string) {
  const old = (await tx.query('SELECT * FROM orders WHERE idempotency_key=$1', [key])).rows[0];
  if (old && old.request_hash !== fingerprint)
    fail(409, 'Este intento de compra ya fue usado con otro carrito. Vuelve a revisar tu pedido.');
  return old;
}
async function buildItems(
  tx: Db,
  items: { product_id: string; quantity: number }[],
  user: any,
  pos = false,
) {
  const output: OrderItem[] = [];
  for (const i of items) {
    const p = (
      await tx.query('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [
        i.product_id,
      ])
    ).rows[0];
    if (!p || p.status !== 'published')
      fail(409, 'Un artículo del carrito ya no está publicado. Retíralo para continuar.');
    if (p.stock - p.reserved < i.quantity)
      fail(409, `Solo quedan ${p.stock - p.reserved} unidades disponibles de ${p.name}.`);
    if (p.kind === 'preorder') {
      if (pos) fail(400, 'Las preventas se reservan desde una cuenta de cliente en la web.');
      if (
        !p.opens_at ||
        !p.closes_at ||
        new Date(p.opens_at) > new Date() ||
        new Date(p.closes_at) <= new Date()
      )
        fail(409, `La preventa de ${p.name} no está abierta.`);
      const used = Number(
        (
          await tx.query(
            `SELECT COALESCE(sum((item->>'quantity')::integer),0) AS total FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) item WHERE o.user_id=$1 AND o.payment_status IN ('pending','approved','review') AND item->>'product_id'=$2 AND (o.payment_environment IS NULL OR o.payment_environment=$3)`,
            [user.id, p.id, flowEnvironment()],
          )
        ).rows[0].total,
      );
      if (used + i.quantity > p.max_per_customer)
        fail(
          409,
          `El máximo de ${p.name} es ${p.max_per_customer} por cliente. Ya tienes ${used} unidades pedidas o reservadas.`,
        );
    }
    const unitPrice = Math.round((p.price * (100 - p.discount_percent)) / 100);
    if (unitPrice < 1) fail(409, `El precio de ${p.name} necesita una revisión de la tienda.`);
    output.push({
      product_id: p.id,
      name: p.name,
      sku: p.sku,
      quantity: i.quantity,
      unit_price: unitPrice,
      original_price: p.price,
      kind: p.kind,
      image: p.images[0] || '',
    });
  }
  return output;
}
function shipping(settings: Settings, input: z.infer<typeof deliverySchema>) {
  if (input.method === 'pickup') {
    if (!settings.address || !settings.hours)
      fail(409, 'La tienda aún debe configurar la dirección y el horario de retiro.');
    return {
      price: 0,
      delivery: {
        method: 'pickup',
        address: settings.address,
        hours: settings.hours,
        instructions: settings.pickup_instructions,
      },
    };
  }
  const carrier = settings.carriers.find((c) => c.enabled && c.id === input.carrier_id);
  if (!carrier) fail(400, 'Elige un transportista disponible.');
  if (!input.recipient || !input.phone || !input.commune || !input.region)
    fail(400, 'Completa destinatario, teléfono, región y comuna para el envío.');
  if (carrier.mode === 'address' && !input.address) fail(400, 'Escribe la dirección de entrega.');
  if (carrier.mode === 'agency' && !input.agency) fail(400, 'Indica la agencia de retiro.');
  return {
    price: carrier.collect ? 0 : carrier.price,
    delivery: {
      ...input,
      carrier: carrier.name,
      mode: carrier.mode,
      collect: carrier.collect,
      freight_note: carrier.collect
        ? 'El transportista cobra el flete por separado al recibir. No está incluido en el pago de Flow.'
        : 'Flete incluido en el total.',
    },
  };
}
export async function reserveOrder(user: any, input: unknown) {
  if (!user.email_verified)
    fail(
      403,
      'Verifica tu correo antes de comprar. Puedes solicitar un nuevo enlace en Mi cuenta.',
    );
  const d = checkoutSchema.parse(input);
  const cart = aggregate(d.items);
  const fingerprint = hash(JSON.stringify({ items: cart, delivery: d.delivery }));
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const key = `web:${user.id}:${d.idempotency_key}`;
    const old = await existing(tx, key, fingerprint);
    if (old) {
      if (old.payment_environment !== flowEnvironment())
        fail(
          409,
          'Este intento pertenece a otro ambiente de pago. Revisa tu carrito e inicia una nueva compra.',
        );
      return old;
    }
    const settings = (await tx.query('SELECT data FROM settings WHERE id=1')).rows[0]
      .data as Settings;
    const delivery = shipping(settings, d.delivery);
    const items = await buildItems(tx, cart, user);
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    if (subtotal + delivery.price > 100000000)
      fail(400, 'El total supera el máximo por pedido. Contacta a la tienda.');
    const id = uuid();
    const order = (
      await tx.query(
        `INSERT INTO orders(id,user_id,customer_email,customer_name,source,payment_status,subtotal,shipping_price,total,delivery,items,idempotency_key,request_hash,expires_at,payment_environment) VALUES($1,$2,$3,$4,'web','pending',$5,$6,$7,$8,$9,$10,$11,now()+($12||' minutes')::interval,$13) RETURNING *`,
        [
          id,
          user.id,
          user.email,
          user.name,
          subtotal,
          delivery.price,
          subtotal + delivery.price,
          JSON.stringify(delivery.delivery),
          JSON.stringify(items),
          key,
          fingerprint,
          settings.reservation_minutes,
          flowEnvironment(),
        ],
      )
    ).rows[0];
    for (const i of items)
      await tx.query('UPDATE products SET reserved=reserved+$2,updated_at=now() WHERE id=$1', [
        i.product_id,
        i.quantity,
      ]);
    await event(tx, id, 'Pedido creado. Unidades reservadas mientras se confirma el pago.');
    await enqueueMail(
      tx,
      `order:${id}:pending`,
      user.email,
      `Pedido #${order.number} pendiente · SERGOD STORE`,
      `Recibimos tu pedido #${order.number}. El pago aún está pendiente.\nPuedes consultarlo en ${appUrl()}/cuenta/pedidos/${id}`,
    );
    return order;
  });
}
export async function completePos(user: any, input: unknown) {
  if (user.role !== 'admin') fail(403, 'Esta acción requiere acceso de administrador.');
  const d = posSchema.parse(input),
    cart = aggregate(d.items);
  const fingerprint = hash(JSON.stringify({ ...d, items: cart }));
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const key = `pos:${user.id}:${d.idempotency_key}`,
      old = await existing(tx, key, fingerprint);
    if (old) return publicOrder(old);
    const items = await buildItems(tx, cart, user, true);
    const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    if (total > 100000000) fail(400, 'El total supera el máximo permitido.');
    if (d.payment_method === 'cash' && (d.cash_received === undefined || d.cash_received < total))
      fail(400, 'El dinero recibido no alcanza para pagar el ticket.');
    const id = uuid();
    const order = (
      await tx.query(
        `INSERT INTO orders(id,customer_name,source,payment_status,fulfillment_status,subtotal,shipping_price,total,delivery,items,idempotency_key,request_hash,payment_method,cash_received,change_amount) VALUES($1,$2,'pos','approved','delivered',$3,0,$3,'{"method":"pos"}',$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          id,
          d.customer_name || 'Venta en local',
          total,
          JSON.stringify(items),
          key,
          fingerprint,
          d.payment_method,
          d.payment_method === 'cash' ? d.cash_received : null,
          d.payment_method === 'cash' ? d.cash_received! - total : null,
        ],
      )
    ).rows[0];
    for (const i of items) {
      await tx.query('UPDATE products SET stock=stock-$2,updated_at=now() WHERE id=$1', [
        i.product_id,
        i.quantity,
      ]);
      await tx.query(
        'INSERT INTO inventory_movements(id,product_id,order_id,delta,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)',
        [uuid(), i.product_id, id, -i.quantity, 'Venta presencial', user.id],
      );
    }
    await event(
      tx,
      id,
      `Venta presencial completada. Medio de pago: ${{ cash: 'efectivo', card: 'tarjeta', transfer: 'transferencia', other: 'otro' }[d.payment_method]}.`,
    );
    return publicOrder(order);
  });
}
async function releaseLocked(tx: Db, o: any, status: 'rejected' | 'expired', message: string) {
  if (o.payment_status !== 'pending') return;
  for (const i of [...o.items].sort((a, b) => a.product_id.localeCompare(b.product_id)))
    await tx.query('UPDATE products SET reserved=reserved-$2,updated_at=now() WHERE id=$1', [
      i.product_id,
      i.quantity,
    ]);
  await tx.query(
    'UPDATE orders SET payment_status=$2,fulfillment_status=$3,updated_at=now() WHERE id=$1',
    [o.id, status, 'cancelled'],
  );
  await event(tx, o.id, message);
  await enqueueMail(
    tx,
    `order:${o.id}:${status}`,
    o.customer_email,
    `Pedido #${o.number}: ${status === 'rejected' ? 'pago rechazado' : 'reserva vencida'}`,
    `${message}\nConsulta tu pedido: ${appUrl()}/cuenta/pedidos/${o.id}`,
  );
}
export async function releaseOrder(
  orderId: string,
  status: 'rejected' | 'expired',
  message: string,
) {
  await (
    await getDb()
  ).transaction(async (tx) => {
    const o = (await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!o) fail(404, 'Pedido no encontrado.');
    await releaseLocked(tx, o, status, message);
  });
}
export async function releaseUnstartedOrders() {
  return (await getDb()).transaction(async (tx) => {
    const rows = (
      await tx.query(
        "SELECT * FROM orders WHERE payment_status='pending' AND expires_at<now() AND flow_token IS NULL AND payment_url IS NULL FOR UPDATE SKIP LOCKED LIMIT 50",
      )
    ).rows;
    for (const o of rows)
      await releaseLocked(
        tx,
        o,
        'expired',
        'La reserva venció antes de iniciar un pago. Se liberaron las unidades.',
      );
    return rows.length;
  });
}
export async function applyPayment(flowToken: string, verified: any) {
  const d = z
    .object({
      commerceOrder: z.string(),
      flowOrder: z.union([z.number(), z.string()]),
      status: z.number().int().min(1).max(4),
      amount: z.union([z.number(), z.string()]),
      currency: z.string(),
    })
    .passthrough()
    .parse(verified);
  return (await getDb()).transaction(async (tx) => {
    const o = (
      await tx.query('SELECT * FROM orders WHERE id::text=$1 AND source=$2 FOR UPDATE', [
        d.commerceOrder,
        'web',
      ])
    ).rows[0];
    if (!o) fail(404, 'La transacción no corresponde a un pedido de esta tienda.');
    if (o.payment_environment !== flowEnvironment())
      fail(
        409,
        'El ambiente del pago no coincide con el pedido. Se requiere revisión de la tienda.',
      );
    if (
      (o.flow_token && o.flow_token !== flowToken) ||
      (o.flow_order && o.flow_order !== String(d.flowOrder)) ||
      d.currency !== 'CLP' ||
      Number(d.amount) !== o.total
    )
      fail(409, 'El pago informado no coincide con el pedido. Se requiere revisión de la tienda.');
    await tx.query(
      'UPDATE orders SET flow_token=COALESCE(flow_token,$2),flow_order=$3 WHERE id=$1',
      [o.id, flowToken.startsWith('recovered:') ? null : flowToken, String(d.flowOrder)],
    );
    if (o.payment_status === 'approved' || o.payment_status === 'review') return publicOrder(o);
    if (d.status === 1) return publicOrder(o);
    if (d.status === 3 || d.status === 4) {
      await releaseLocked(
        tx,
        o,
        d.status === 3 ? 'rejected' : 'expired',
        d.status === 3
          ? 'Flow verificó que el pago fue rechazado. Se liberaron las unidades.'
          : 'Flow verificó que la transacción fue anulada. Se liberaron las unidades.',
      );
      return publicOrder((await tx.query('SELECT * FROM orders WHERE id=$1', [o.id])).rows[0]);
    }
    const ordered = [...o.items].sort((a, b) => a.product_id.localeCompare(b.product_id));
    let canFulfill = true;
    for (const i of ordered) {
      const p = (await tx.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [i.product_id]))
        .rows[0];
      if (
        !p ||
        (o.payment_status === 'pending'
          ? p.reserved < i.quantity
          : p.stock - p.reserved < i.quantity)
      )
        canFulfill = false;
    }
    if (!canFulfill) {
      await tx.query("UPDATE orders SET payment_status='review',updated_at=now() WHERE id=$1", [
        o.id,
      ]);
      await event(
        tx,
        o.id,
        'Pago verificado por Flow. Requiere revisión porque no hay unidades suficientes para completar la entrega.',
      );
      await enqueueMail(
        tx,
        `order:${o.id}:review`,
        o.customer_email,
        `Pedido #${o.number}: pago en revisión`,
        'Tu pago fue recibido. La tienda debe revisar la disponibilidad antes de confirmar la entrega.',
      );
    } else {
      for (const i of ordered) {
        await tx.query(
          'UPDATE products SET stock=stock-$2,reserved=reserved-$3,updated_at=now() WHERE id=$1',
          [i.product_id, i.quantity, o.payment_status === 'pending' ? i.quantity : 0],
        );
        await tx.query(
          'INSERT INTO inventory_movements(id,product_id,order_id,delta,reason) VALUES($1,$2,$3,$4,$5)',
          [uuid(), i.product_id, o.id, -i.quantity, 'Pago Flow verificado'],
        );
      }
      await tx.query(
        "UPDATE orders SET payment_status='approved',fulfillment_status='received',updated_at=now() WHERE id=$1",
        [o.id],
      );
      await event(tx, o.id, 'Pago aprobado y verificado directamente con Flow. Pedido confirmado.');
      await enqueueMail(
        tx,
        `order:${o.id}:approved`,
        o.customer_email,
        `Pedido #${o.number} confirmado · SERGOD STORE`,
        `Verificamos tu pago por $${o.total.toLocaleString('es-CL')}.\nConsulta la preparación y entrega en ${appUrl()}/cuenta/pedidos/${o.id}`,
      );
    }
    return publicOrder((await tx.query('SELECT * FROM orders WHERE id=$1', [o.id])).rows[0]);
  });
}
export async function listOrders(user: any, admin = false) {
  return (
    await (
      await getDb()
    ).query(
      admin
        ? 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000'
        : 'SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',
      admin ? [] : [user.id],
    )
  ).rows.map(publicOrder);
}
export async function commercialOrderStats() {
  const row = (
    await (
      await getDb()
    ).query(`SELECT count(*)::integer AS orders,
    count(*) FILTER (WHERE payment_status='pending')::integer AS pending,
    COALESCE(sum(total) FILTER (WHERE payment_status='approved'),0) AS revenue
    FROM orders WHERE payment_environment IS DISTINCT FROM 'sandbox'`)
  ).rows[0];
  return { ...row, revenue: Number(row.revenue) };
}
export async function getOrder(id: string, user: any, admin = false) {
  const db = await getDb();
  const o = (
    await db.query(
      admin
        ? 'SELECT * FROM orders WHERE id::text=$1'
        : 'SELECT * FROM orders WHERE id::text=$1 AND user_id=$2',
      admin ? [id] : [id, user.id],
    )
  ).rows[0];
  if (!o) fail(404, 'Pedido no encontrado.');
  const events = (
    await db.query(
      'SELECT id,message,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at',
      [o.id],
    )
  ).rows;
  return { ...publicOrder(o), events };
}
export async function updateDelivery(id: string, input: unknown) {
  const d = z
    .object({
      fulfillment_status: z.enum(['received', 'preparing', 'ready', 'shipped', 'delivered']),
      carrier: z.string().max(100).default(''),
      tracking: z.string().max(150).default(''),
    })
    .parse(input);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const o = (await tx.query('SELECT * FROM orders WHERE id::text=$1 FOR UPDATE', [id])).rows[0];
    if (!o) fail(404, 'Pedido no encontrado.');
    if (o.payment_status !== 'approved')
      fail(409, 'Solo puedes preparar o entregar pedidos con pago aprobado.');
    if (o.payment_environment === 'sandbox' && flowEnvironment() === 'production')
      fail(409, 'Este pedido es una prueba de sandbox. No corresponde a una entrega comercial.');
    if (o.delivery.method === 'pickup' && d.fulfillment_status === 'shipped')
      fail(400, 'Este pedido es para retiro en tienda.');
    if (o.delivery.method === 'shipping' && d.fulfillment_status === 'ready')
      fail(400, 'Este pedido es para envío. Usa En preparación o Enviado.');
    if (d.fulfillment_status === 'shipped' && (!d.carrier.trim() || !d.tracking.trim()))
      fail(400, 'Completa transportista y número de seguimiento para marcar como enviado.');
    if (
      o.fulfillment_status === d.fulfillment_status &&
      o.carrier === d.carrier &&
      o.tracking === d.tracking
    )
      return;
    await tx.query(
      'UPDATE orders SET fulfillment_status=$2,carrier=$3,tracking=$4,updated_at=now() WHERE id=$1',
      [id, d.fulfillment_status, d.carrier, d.tracking],
    );
    const labels: any = {
      received: 'Pedido recibido',
      preparing: 'En preparación',
      ready: 'Listo para retirar',
      shipped: 'Enviado',
      delivered: 'Entregado',
    };
    const message = `${labels[d.fulfillment_status]}${d.tracking ? `. ${d.carrier}: ${d.tracking}` : ''}`;
    await event(tx, id, message);
    await enqueueMail(
      tx,
      `delivery:${id}:${uuid()}`,
      o.customer_email,
      `Pedido #${o.number}: ${labels[d.fulfillment_status]}`,
      `${message}\n${appUrl()}/cuenta/pedidos/${id}`,
    );
  });
  return getOrder(id, null, true);
}
