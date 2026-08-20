import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  InventoryAdjustment,
  InventoryStockEntry,
  InventoryThresholdOverride,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import { assertPositiveQuantity, InventoryError } from '../domain/inventory.js';
import type {
  InventoryAdminAuthorizer,
  InventoryMovementView,
  InventoryPositionView,
  InventoryRepository,
} from './ports.js';

export class InventoryAdminService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly authorizer: InventoryAdminAuthorizer,
  ) {}

  async getPosition(context: ExecutionContext, productId: string) {
    await this.authorize(context);
    return serializePosition(await this.requiredPosition(productId));
  }

  async listMovements(
    context: ExecutionContext,
    productId: string,
    input: { readonly cursor?: string; readonly limit: number },
  ) {
    await this.authorize(context);
    await this.requiredPosition(productId);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, productId);
    const page = await this.repository.listMovements({
      limit: input.limit,
      productId,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeMovement),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor(productId, last.occurredAt, last.movementId)
          : null,
    };
  }

  async registerStockEntry(
    context: ExecutionContext,
    productId: string,
    body: InventoryStockEntry,
  ) {
    await this.authorizeMutation(context);
    await this.requiredPosition(productId);
    assertPositiveQuantity(body.quantity);
    const normalized = {
      quantity: body.quantity,
      reason: normalizeOptionalText(body.reason),
      reference: normalizeOptionalText(body.reference),
    };
    if (normalized.reason === null && normalized.reference === null) {
      throw new InventoryError(
        'INVENTORY_STOCK_ENTRY_ORIGIN_REQUIRED',
        'VALIDATION',
        'A stock entry requires a reason or reference.',
      );
    }
    const result = await this.repository.applyRegularMovement({
      ...normalized,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      movementType: 'STOCK_ENTRY',
      productId,
      requestFingerprint: fingerprint('STOCK_ENTRY', productId, normalized),
    });
    return {
      movementId: result.movementId,
      position: serializePosition(await this.requiredPosition(productId)),
      replayed: result.replayed,
    };
  }

  async adjust(context: ExecutionContext, productId: string, body: InventoryAdjustment) {
    await this.authorizeMutation(context);
    await this.requiredPosition(productId);
    assertPositiveQuantity(body.quantity);
    const normalized = {
      direction: body.direction,
      investigationReference: normalizeRequiredText(body.investigationReference),
      quantity: body.quantity,
      reason: normalizeRequiredText(body.reason),
    };
    const result = await this.repository.applyRegularMovement({
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      movementType:
        normalized.direction === 'POSITIVE' ? 'POSITIVE_ADJUSTMENT' : 'NEGATIVE_ADJUSTMENT',
      productId,
      quantity: normalized.quantity,
      reason: normalized.reason,
      reference: normalized.investigationReference,
      requestFingerprint: fingerprint('ADJUSTMENT', productId, normalized),
    });
    return {
      movementId: result.movementId,
      position: serializePosition(await this.requiredPosition(productId)),
      replayed: result.replayed,
    };
  }

  async setThresholdOverride(
    context: ExecutionContext,
    productId: string,
    body: InventoryThresholdOverride,
  ) {
    await this.authorizeMutation(context);
    await this.requiredPosition(productId);
    const normalized = { lowStockThresholdOverride: body.lowStockThresholdOverride };
    const result = await this.repository.setThresholdOverride({
      ...normalized,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      productId,
      requestFingerprint: fingerprint('THRESHOLD_OVERRIDE', productId, normalized),
    });
    return {
      position: serializePosition(await this.requiredPosition(productId)),
      replayed: result.replayed,
    };
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new InventoryError(
        'INVENTORY_ACCESS_DENIED',
        'VALIDATION',
        'Inventory administration requires an authenticated user actor.',
      );
    }
    await this.authorizer.assertCanManageInventory(context);
  }

  private async authorizeMutation(context: ExecutionContext): Promise<void> {
    await this.authorize(context);
    requiredIdempotencyKey(context);
  }

  private async requiredPosition(productId: string): Promise<InventoryPositionView> {
    const position = await this.repository.findPosition(productId);
    if (position === null) {
      throw new InventoryError(
        'INVENTORY_POSITION_NOT_FOUND',
        'NOT_FOUND',
        'Inventory position was not found.',
      );
    }
    return position;
  }
}

function serializePosition(position: InventoryPositionView) {
  return { ...position, updatedAt: position.updatedAt.toISOString() };
}

function serializeMovement(movement: InventoryMovementView) {
  return { ...movement, occurredAt: movement.occurredAt.toISOString() };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized === '' ? null : normalized;
}

function normalizeRequiredText(value: string): string {
  const normalized = normalizeOptionalText(value);
  if (normalized === null) {
    throw new InventoryError(
      'INVENTORY_REQUIRED_TEXT_MISSING',
      'VALIDATION',
      'Required inventory text is missing.',
    );
  }
  return normalized;
}

function requiredIdempotencyKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (!key) {
    throw new InventoryError(
      'INVENTORY_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Inventory mutations require an idempotency key.',
    );
  }
  return key;
}

function fingerprint(operation: string, productId: string, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ body, operation, productId })).digest('hex');
}

function encodeCursor(productId: string, occurredAt: Date, movementId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ movementId, occurredAt: occurredAt.toISOString(), productId, version: 1 }),
    'utf8',
  ).toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-inventory-movement-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}

function decodeCursor(value: string, productId: string) {
  const [payload, checksum, extra] = value.split('.');
  if (payload === undefined || checksum === undefined || extra !== undefined) throw invalidCursor();
  const expected = createHash('sha256')
    .update(`sergod-inventory-movement-cursor-v1\0${payload}`)
    .digest('base64url');
  const actualBytes = Buffer.from(checksum);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw invalidCursor();
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version !== 1 ||
      parsed.productId !== productId ||
      typeof parsed.movementId !== 'string' ||
      !uuidPattern.test(parsed.movementId) ||
      typeof parsed.occurredAt !== 'string'
    ) {
      throw invalidCursor();
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (!Number.isFinite(occurredAt.getTime()) || occurredAt.toISOString() !== parsed.occurredAt) {
      throw invalidCursor();
    }
    return { movementId: parsed.movementId, occurredAt };
  } catch (error) {
    if (error instanceof InventoryError) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): InventoryError {
  return new InventoryError(
    'INVENTORY_CURSOR_INVALID',
    'VALIDATION',
    'Inventory movement cursor is invalid.',
  );
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
