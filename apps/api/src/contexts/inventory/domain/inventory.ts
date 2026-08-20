export type RegularInventoryMovementType =
  'NEGATIVE_ADJUSTMENT' | 'POSITIVE_ADJUSTMENT' | 'STOCK_ENTRY';

export type InventoryErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class InventoryError extends Error {
  constructor(
    readonly code: string,
    readonly category: InventoryErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'InventoryError';
  }
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new InventoryError(
      'INVENTORY_QUANTITY_INVALID',
      'VALIDATION',
      'Inventory quantity must be a positive safe integer.',
    );
  }
}

export function inventoryProjection(input: {
  readonly defaultThreshold: number;
  readonly onHand: number;
  readonly override: number | null;
  readonly reserved: number;
}) {
  const available = input.onHand - input.reserved;
  const effectiveLowStockThreshold = input.override ?? input.defaultThreshold;
  return {
    available,
    effectiveLowStockThreshold,
    lowStock: effectiveLowStockThreshold > 0 && available <= effectiveLowStockThreshold,
    thresholdSource: input.override === null ? ('GLOBAL' as const) : ('OVERRIDE' as const),
  };
}
