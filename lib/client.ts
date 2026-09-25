import type { Product } from './types';
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
export const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
export const price = (p: Product) => Math.round((p.price * (100 - p.discount_percent)) / 100);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Santiago',
      }).format(new Date(value))
    : 'Sin fecha';
export const paymentLabels: Record<string, string> = {
  pending: 'Pago pendiente',
  approved: 'Pago aprobado',
  rejected: 'Pago rechazado',
  expired: 'Reserva vencida',
  review: 'Pago en revisión',
};
export const deliveryLabels: Record<string, string> = {
  received: 'Pedido recibido',
  preparing: 'En preparación',
  ready: 'Listo para retiro',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};
