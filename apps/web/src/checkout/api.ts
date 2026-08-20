import { authorizedRequest } from '../identity/api.js';

const groupPath = (groupId: string, suffix: string) =>
  `/api/v1/checkout/groups/${encodeURIComponent(groupId)}/${suffix}`;

const mutate = <T>(path: string, method: string, body?: unknown) =>
  authorizedRequest<T>(path, {
    method,
    headers: { 'idempotency-key': crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const readCheckoutSummary = (groupId: string) =>
  authorizedRequest<ReturnType<JSON['parse']>>(groupPath(groupId, 'summary'));
export const replaceDeliveryIntent = (groupId: string, body: unknown) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'delivery-intent'), 'PUT', body);
export const clearDeliveryIntent = (groupId: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'delivery-intent'), 'DELETE');
export const selectCheckoutCoupon = (groupId: string, code: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'coupon'), 'PUT', { code });
export const clearCheckoutCoupon = (groupId: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'coupon'), 'DELETE');
export const selectCheckoutPoints = (groupId: string, points: number) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'points'), 'PUT', { points });
export const clearCheckoutPoints = (groupId: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'points'), 'DELETE');
export const revalidateCheckout = (groupId: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'revalidate'), 'POST', {});
export const createCheckoutOrder = (groupId: string) =>
  mutate<ReturnType<JSON['parse']>>(groupPath(groupId, 'order'), 'POST', {});
export const createPaymentAttempt = (
  orderId: string,
  body: { readonly payerEmail: string; readonly provider: 'FLOW' | 'WEBPAY' },
) =>
  mutate<ReturnType<JSON['parse']>>(
    `/api/v1/orders/${encodeURIComponent(orderId)}/payment-attempts`,
    'POST',
    body,
  );
