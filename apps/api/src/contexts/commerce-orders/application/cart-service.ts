import { createHash } from 'node:crypto';

import type { CartAddLine, CartMoveConflictLine, CartUpdateLine } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import {
  assertPositiveCartQuantity,
  type CartOwner,
  requiredCartIdempotencyKey,
} from '../domain/cart.js';
import type { CartRepository, CartView } from './ports.js';

export class CartService {
  constructor(private readonly repository: CartRepository) {}

  async getCurrent(owner: CartOwner) {
    const cart = await this.repository.findCart(owner);
    return { item: cart === null ? null : serializeCart(cart) };
  }

  async createCurrent(context: ExecutionContext, owner: CartOwner) {
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    return serializeMutation(
      await this.repository.ensureCart({
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('CREATE_CART', owner, {}),
      }),
    );
  }

  async addLine(context: ExecutionContext, owner: CartOwner, body: CartAddLine) {
    assertPositiveCartQuantity(body.quantity);
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    const normalized = {
      preorderCampaignId: body.preorderCampaignId,
      productId: body.productId.toLowerCase(),
      quantity: body.quantity,
    };
    return serializeMutation(
      await this.repository.addLine({
        ...normalized,
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('ADD_LINE', owner, normalized),
      }),
    );
  }

  async updateLine(
    context: ExecutionContext,
    owner: CartOwner,
    cartLineId: string,
    body: CartUpdateLine,
  ) {
    assertPositiveCartQuantity(body.quantity);
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    const normalized = { cartLineId, quantity: body.quantity };
    return serializeMutation(
      await this.repository.updateLine({
        ...normalized,
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('UPDATE_LINE', owner, normalized),
      }),
    );
  }

  async removeLine(context: ExecutionContext, owner: CartOwner, cartLineId: string) {
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    return serializeMutation(
      await this.repository.removeLine({
        cartLineId,
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('REMOVE_LINE', owner, { cartLineId }),
      }),
    );
  }

  async moveConflictLine(
    context: ExecutionContext,
    owner: CartOwner,
    cartLineId: string,
    body: CartMoveConflictLine,
  ) {
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    const normalized = { cartLineId, targetGroupId: body.targetGroupId.toLowerCase() };
    return serializeMutation(
      await this.repository.moveConflictLine({
        ...normalized,
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('MOVE_CONFLICT_LINE', owner, normalized),
      }),
    );
  }

  async createCompatibleGroup(context: ExecutionContext, owner: CartOwner, cartLineId: string) {
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    return serializeMutation(
      await this.repository.createCompatibleGroup({
        cartLineId,
        context,
        idempotencyKey: key,
        owner,
        requestFingerprint: fingerprint('CREATE_COMPATIBLE_GROUP', owner, { cartLineId }),
      }),
    );
  }

  async merge(context: ExecutionContext, accountId: string, anonymousSessionId: string) {
    const key = requiredCartIdempotencyKey(context.idempotencyKey);
    return serializeMutation(
      await this.repository.merge({
        accountId,
        anonymousSessionId,
        context,
        idempotencyKey: key,
        requestFingerprint: fingerprint(
          'MERGE_CART',
          { accountId, kind: 'ACCOUNT' },
          {
            anonymousSessionId,
          },
        ),
      }),
    );
  }
}

function fingerprint(operation: string, owner: CartOwner, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ body, operation, owner })).digest('hex');
}

function serializeMutation(result: { readonly cart: CartView; readonly replayed: boolean }) {
  return { item: serializeCart(result.cart), replayed: result.replayed };
}

function serializeCart(cart: CartView) {
  return {
    ...cart,
    createdAt: cart.createdAt.toISOString(),
    expiresAt: cart.expiresAt?.toISOString() ?? null,
    groups: cart.groups.map((group) => ({
      ...group,
      createdAt: group.createdAt.toISOString(),
      deliveryIntent:
        group.deliveryIntent === null
          ? null
          : {
              ...group.deliveryIntent,
              lastValidatedAt: group.deliveryIntent.lastValidatedAt?.toISOString() ?? null,
            },
      lines: group.lines.map((line) => ({
        ...line,
        createdAt: line.createdAt.toISOString(),
        updatedAt: line.updatedAt.toISOString(),
      })),
      updatedAt: group.updatedAt.toISOString(),
    })),
    updatedAt: cart.updatedAt.toISOString(),
  };
}
