import { authorizedRequest, publicRequest } from '../identity/api.js';

export interface PosCatalogProduct {
  readonly availableForPurchase: boolean;
  readonly availabilityStatus: 'AVAILABLE' | 'LAST_UNITS' | 'OUT_OF_STOCK';
  readonly game: { readonly gameId: string; readonly name: string };
  readonly name: string;
  readonly priceAmountClp: number;
  readonly primaryResource: {
    readonly altText: string;
    readonly heightPx: number;
    readonly resourceId: string;
    readonly widthPx: number;
  };
  readonly productId: string;
  readonly saleType: 'PREORDER' | 'REGULAR';
}
const mutation = <T>(path: string, body: unknown, method = 'POST') =>
  authorizedRequest<T>(path, {
    method,
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
export const findSku = (sku: string) =>
  authorizedRequest<{
    item: {
      product_id: string;
      sku: string;
      name: string;
      sale_type: 'REGULAR' | 'PREORDER';
      price_amount_clp: string;
    };
  }>(`/api/v1/admin/pos/products/by-sku?sku=${encodeURIComponent(sku)}`);
export const posCatalog = () =>
  publicRequest<{ items: PosCatalogProduct[]; nextCursor: string | null }>(
    '/api/v1/catalog/products?limit=100&sort=NAME_ASC',
  );
export const createSale = (body: unknown) =>
  mutation<{ id: string }>('/api/v1/admin/pos/sales', body);
export const addLine = (id: string, body: unknown) =>
  mutation(`/api/v1/admin/pos/sales/${id}/lines`, body);
export const updateLine = (saleId: string, lineId: string, quantity: number) =>
  mutation(`/api/v1/admin/pos/sales/${saleId}/lines/${lineId}`, { quantity }, 'PATCH');
export const removeLine = (saleId: string, lineId: string) =>
  mutation(`/api/v1/admin/pos/sales/${saleId}/lines/${lineId}`, undefined, 'DELETE');
export const getSale = (id: string) =>
  authorizedRequest<ReturnType<JSON['parse']>>(`/api/v1/admin/pos/sales/${id}`);
export const prepareSale = (id: string) => mutation(`/api/v1/admin/pos/sales/${id}/prepare`, {});
export const completeSale = (id: string, body: unknown) =>
  mutation(`/api/v1/admin/pos/sales/${id}/complete`, body);
export const returnSaleToDraft = (id: string, reason: string) =>
  mutation(`/api/v1/admin/pos/sales/${id}/return-to-draft`, { reason });
export const discardSale = (id: string, reason: string) =>
  mutation(`/api/v1/admin/pos/sales/${id}/discard`, { reason });
export const setBuyer = (id: string, body: unknown) =>
  mutation(`/api/v1/admin/pos/sales/${id}/buyer`, body);
export const setCoupon = (id: string, couponCode: string | null) =>
  mutation(`/api/v1/admin/pos/sales/${id}/coupon`, { couponCode });
export const setLoyalty = (id: string, points: number) =>
  mutation(`/api/v1/admin/pos/sales/${id}/loyalty`, { points });
export const moneyMethods = () =>
  authorizedRequest<ReturnType<JSON['parse']>>('/api/v1/admin/pos/external-money-methods');
export const createMoneyMethod = (body: unknown) =>
  mutation<{ id: string }>('/api/v1/admin/pos/external-money-methods', body);
export const editMoneyMethod = (id: string, body: unknown) =>
  mutation<{ id: string }>(`/api/v1/admin/pos/external-money-methods/${id}`, body, 'PATCH');
export const deleteMoneyMethod = (id: string) =>
  mutation<{ id: string }>(`/api/v1/admin/pos/external-money-methods/${id}`, undefined, 'DELETE');
export const transitionMoneyMethod = (id: string, nextState: string, reason: string) =>
  mutation(`/api/v1/admin/pos/external-money-methods/${id}/state-transitions`, {
    nextState,
    reason,
  });
export const sales = () =>
  authorizedRequest<ReturnType<JSON['parse']>>('/api/v1/admin/pos/sales?limit=25');
export const preorderCampaigns = (productId: string) =>
  authorizedRequest<ReturnType<JSON['parse']>>(
    `/api/v1/admin/preorders/campaigns?limit=100&productId=${encodeURIComponent(productId)}&operationalState=OPEN&publicationStatus=PUBLISHED`,
  );
export const daily = (branchId: string, date: string) =>
  authorizedRequest<ReturnType<JSON['parse']>>(
    `/api/v1/admin/pos/daily-summary?branchId=${branchId}&date=${date}`,
  );
