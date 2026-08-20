import { authorizedRequest } from '../identity/api.js';

const mutate = <T>(path: string, body: unknown, method = 'POST') =>
  authorizedRequest<T>(path, {
    method,
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });

export const readCoverage = () =>
  authorizedRequest<ReturnType<JSON['parse']>>('/api/v1/admin/service-coverage');
export const savePublicServiceInfo = (body: unknown) =>
  mutate<{ id: string }>('/api/v1/admin/service-coverage/public-service-info', body);
export const transitionServiceInfo = (id: string, nextState: string, reason: string) =>
  mutate(`/api/v1/admin/service-coverage/public-service-info/${id}/state-transitions`, {
    nextState,
    reason,
  });
