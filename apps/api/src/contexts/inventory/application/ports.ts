import type { ExecutionContext } from '@sergod/foundation';

import type { RegularInventoryMovementType } from '../domain/inventory.js';

export interface InventoryAdminAuthorizer {
  assertCanManageInventory(context: ExecutionContext): Promise<void>;
}

export interface InventoryPositionView {
  readonly available: number;
  readonly branchId: string;
  readonly effectiveLowStockThreshold: number;
  readonly inventoryPositionId: string;
  readonly lowStock: boolean;
  readonly lowStockThresholdOverride: number | null;
  readonly onHand: number;
  readonly productId: string;
  readonly reserved: number;
  readonly thresholdSource: 'GLOBAL' | 'OVERRIDE';
  readonly updatedAt: Date;
  readonly version: number;
}

export interface InventoryMovementView {
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly inventoryPositionId: string;
  readonly movementId: string;
  readonly movementType: RegularInventoryMovementType;
  readonly occurredAt: Date;
  readonly quantity: number;
  readonly reason: string | null;
  readonly reference: string | null;
  readonly sourceId: string;
  readonly sourceType: string;
}

export interface InventoryRepository {
  applyRegularMovement(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly movementType: RegularInventoryMovementType;
    readonly productId: string;
    readonly quantity: number;
    readonly reason: string | null;
    readonly reference: string | null;
    readonly requestFingerprint: string;
  }): Promise<{ readonly movementId: string; readonly replayed: boolean }>;
  findPosition(productId: string): Promise<InventoryPositionView | null>;
  listMovements(input: {
    readonly cursor?: { readonly movementId: string; readonly occurredAt: Date };
    readonly limit: number;
    readonly productId: string;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly InventoryMovementView[] }>;
  setThresholdOverride(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly lowStockThresholdOverride: number | null;
    readonly productId: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean }>;
}
