type Item = Readonly<Record<string, unknown>>;

const operationalLabels: Readonly<Record<string, string>> = {
  ACTIVE: 'Activo',
  ARCHIVED: 'Archivado',
  CANCELLED: 'Cancelado',
  CLOSED: 'Cerrado',
  COMPLETED: 'Completado',
  DEACTIVATED: 'Desactivado',
  DISCARDED: 'Descartado',
  DRAFT: 'Borrador',
  FAILED: 'Fallido',
  FULFILLED: 'Completado',
  INACTIVE: 'Inactivo',
  OPEN: 'Abierto',
  PAID: 'Pagado',
  PENDING: 'Pendiente',
  PENDING_PAYMENT: 'Pendiente de pago',
  PREORDER: 'Preventa',
  PREPARING: 'En preparación',
  PUBLISHED: 'Publicado',
  QUARANTINED: 'En revisión',
  READY_FOR_PICKUP: 'Listo para retiro',
  REGULAR: 'Venta regular',
  REMOVED: 'Retirado',
  REPLACED: 'Reemplazado',
  RETIRED: 'Retirado',
  SCHEDULED: 'Programado',
  SHIPPED: 'Despachado',
  SUCCESS: 'Exitoso',
  SUSPENDED: 'Suspendido',
  UNPUBLISHED: 'No publicado',
  WITHDRAWN: 'Retirado',
};

const verifiedTextRepairs: ReadonlyArray<readonly [RegExp, string]> = [
  [/aceptaci\uFFFDn/giu, 'aceptación'],
  [/categor\uFFFDa/giu, 'categoría'],
  [/colecci\uFFFDn/giu, 'colección'],
];

export function readableText(value: string): string {
  return verifiedTextRepairs.reduce(
    (text, [pattern, replacement]) =>
      text.replace(pattern, (match) =>
        match.charAt(0) === match.charAt(0).toLocaleUpperCase('es-CL')
          ? `${replacement.charAt(0).toLocaleUpperCase('es-CL')}${replacement.slice(1)}`
          : replacement,
      ),
    value,
  );
}

export function operationalValue(value: string): string {
  return operationalLabels[value] ?? readableText(value);
}

export function itemIdentifier(item: Item): string | null {
  for (const key of [
    'paymentAttemptId',
    'fulfillmentId',
    'orderId',
    'preorderCampaignId',
    'couponId',
    'productId',
    'collectionId',
    'categoryId',
    'gameId',
    'tcgGameId',
    'promotionId',
    'loyaltyConfigurationId',
    'systemConfigurationVersionId',
    'editorialEntryId',
    'auditEntryId',
  ]) {
    if (typeof item[key] === 'string') return item[key];
  }
  return null;
}

export function itemReference(item: Item): string {
  for (const key of [
    'publicNumber',
    'orderPublicNumber',
    'name',
    'title',
    'code',
    'configurationKey',
    'action',
    'sku',
  ]) {
    if (typeof item[key] === 'string') return readableText(item[key]);
  }
  const id = itemIdentifier(item);
  return id === null ? '—' : shortIdentifier(id);
}

export function itemStatus(item: Item): string {
  for (const key of ['status', 'state', 'publicationStatus', 'operationalState', 'result']) {
    if (typeof item[key] === 'string') return operationalValue(item[key]);
  }
  return '—';
}

export function itemDetail(item: Item): string {
  for (const key of [
    'provider',
    'type',
    'resourceType',
    'saleType',
    'estimatedArrivalText',
    'reason',
  ]) {
    if (typeof item[key] === 'string') return operationalValue(item[key]);
  }
  return '—';
}

export function shortIdentifier(value: string): string {
  if (value.length <= 16) return readableText(value);
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
