import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CreateCoupon,
  EditPromotion,
  PromotionPreview,
  PromotionState,
} from '@sergod/contracts';
import type { Clock, ExecutionContext } from '@sergod/foundation';

import {
  assertPromotionConfiguration,
  evaluatePromotion,
  normalizeCouponCode,
  normalizePromotionName,
  PromotionError,
} from '../domain/promotions.js';
import type {
  CouponDetail,
  PromotionDetail,
  PromotionsAdminAuthorizer,
  PromotionsRepository,
} from './ports.js';

export class PromotionsAdminService {
  constructor(
    private readonly repository: PromotionsRepository,
    private readonly authorizer: PromotionsAdminAuthorizer,
    private readonly clock: Clock,
  ) {}

  async listPromotions(
    context: ExecutionContext,
    input: {
      readonly activationMode?: 'AUTOMATIC' | 'COUPON_REQUIRED' | undefined;
      readonly cursor?: string | undefined;
      readonly limit: number;
      readonly state?: PromotionState | undefined;
    },
  ) {
    await this.authorize(context);
    const filterHash = fingerprint('LIST_PROMOTIONS', null, {
      activationMode: input.activationMode ?? null,
      state: input.state ?? null,
    });
    const cursor =
      input.cursor === undefined ? undefined : decodeCursor(input.cursor, 'PROMOTION', filterHash);
    const page = await this.repository.listPromotions({
      limit: input.limit,
      ...(input.activationMode === undefined ? {} : { activationMode: input.activationMode }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializePromotion),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor('PROMOTION', filterHash, last.createdAt, last.promotionId)
          : null,
    };
  }

  async getPromotion(context: ExecutionContext, promotionId: string) {
    await this.authorize(context);
    return serializePromotion(
      required(await this.repository.findPromotion(promotionId), 'PROMOTION_NOT_FOUND'),
    );
  }

  async createPromotion(context: ExecutionContext, body: EditPromotion) {
    await this.authorizeMutation(context);
    const configuration = normalizeConfiguration(body);
    const result = await this.repository.createPromotion({
      configuration,
      context,
      idempotencyKey: requiredKey(context),
      requestFingerprint: fingerprint('CREATE_PROMOTION', null, configuration),
    });
    return {
      item: await this.getPromotion(context, result.promotionId),
      replayed: result.replayed,
    };
  }

  async editPromotion(context: ExecutionContext, promotionId: string, body: EditPromotion) {
    await this.authorizeMutation(context);
    const configuration = normalizeConfiguration(body);
    const result = await this.repository.updatePromotion({
      configuration,
      context,
      idempotencyKey: requiredKey(context),
      promotionId,
      requestFingerprint: fingerprint('UPDATE_PROMOTION', promotionId, configuration),
    });
    return {
      item: await this.getPromotion(context, result.promotionId),
      replayed: result.replayed,
    };
  }

  async transitionPromotion(
    context: ExecutionContext,
    promotionId: string,
    nextState: PromotionState,
  ) {
    await this.authorizeMutation(context);
    const result = await this.repository.transitionPromotion({
      context,
      idempotencyKey: requiredKey(context),
      nextState,
      promotionId,
      requestFingerprint: fingerprint('TRANSITION_PROMOTION', promotionId, { nextState }),
    });
    return {
      item: await this.getPromotion(context, result.promotionId),
      replayed: result.replayed,
    };
  }

  async listCoupons(
    context: ExecutionContext,
    input: {
      readonly cursor?: string | undefined;
      readonly limit: number;
      readonly promotionId?: string | undefined;
      readonly state?: Parameters<PromotionsRepository['listCoupons']>[0]['state'] | undefined;
    },
  ) {
    await this.authorize(context);
    const filterHash = fingerprint('LIST_COUPONS', null, {
      promotionId: input.promotionId ?? null,
      state: input.state ?? null,
    });
    const cursor =
      input.cursor === undefined ? undefined : decodeCursor(input.cursor, 'COUPON', filterHash);
    const page = await this.repository.listCoupons({
      limit: input.limit,
      ...(input.promotionId === undefined ? {} : { promotionId: input.promotionId }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeCoupon),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor('COUPON', filterHash, last.createdAt, last.couponId)
          : null,
    };
  }

  async getCoupon(context: ExecutionContext, couponId: string) {
    await this.authorize(context);
    return serializeCoupon(
      required(await this.repository.findCoupon(couponId), 'COUPON_NOT_FOUND'),
    );
  }

  async createCoupon(context: ExecutionContext, body: CreateCoupon) {
    await this.authorizeMutation(context);
    assertCouponWindow(body.startsAt, body.endsAt);
    const persisted = {
      endsAt: body.endsAt,
      globalLimit: body.globalLimit,
      normalizedCode: normalizeCouponCode(body.code),
      perAccountLimit: body.perAccountLimit,
      promotionId: body.promotionId,
      startsAt: body.startsAt,
    };
    const result = await this.repository.createCoupon({
      context,
      coupon: persisted,
      idempotencyKey: requiredKey(context),
      requestFingerprint: fingerprint('CREATE_COUPON', null, persisted),
    });
    return { item: await this.getCoupon(context, result.couponId), replayed: result.replayed };
  }

  async transitionCoupon(
    context: ExecutionContext,
    couponId: string,
    nextState: Parameters<PromotionsRepository['transitionCoupon']>[0]['nextState'],
  ) {
    await this.authorizeMutation(context);
    const result = await this.repository.transitionCoupon({
      context,
      couponId,
      idempotencyKey: requiredKey(context),
      nextState,
      requestFingerprint: fingerprint('TRANSITION_COUPON', couponId, { nextState }),
    });
    return { item: await this.getCoupon(context, result.couponId), replayed: result.replayed };
  }

  async preview(context: ExecutionContext, input: PromotionPreview) {
    await this.authorize(context);
    if (new Date(input.evaluatedAt).getTime() !== this.clock.now().getTime()) {
      // A preview deliberately accepts an explicit hypothetical clock; this read keeps Clock injected.
    }
    return evaluatePromotion({
      ...input,
      promotion: { ...input.promotion, name: normalizePromotionName(input.promotion.name) },
    });
  }

  private async authorize(context: ExecutionContext) {
    if (context.actorType !== 'USER' || context.actorId === undefined)
      throw new PromotionError(
        'PROMOTIONS_ACCESS_DENIED',
        'VALIDATION',
        'Access is not available.',
      );
    await this.authorizer.assertCanManagePromotions(context);
  }

  private async authorizeMutation(context: ExecutionContext) {
    await this.authorize(context);
    requiredKey(context);
  }
}

function normalizeConfiguration(input: EditPromotion): EditPromotion {
  const configuration = { ...input, name: normalizePromotionName(input.name) };
  assertPromotionConfiguration(configuration);
  return configuration;
}

function assertCouponWindow(startsAt: string | null, endsAt: string | null) {
  if (
    startsAt !== null &&
    endsAt !== null &&
    new Date(startsAt).getTime() >= new Date(endsAt).getTime()
  ) {
    throw new PromotionError('COUPON_WINDOW_INVALID', 'VALIDATION', 'Coupon window is invalid.');
  }
}

function requiredKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (key === undefined || !/^[\x21-\x7e]{1,255}$/u.test(key))
    throw new PromotionError(
      'PROMOTIONS_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'A valid Idempotency-Key is required.',
    );
  return key;
}

function required<T>(value: T | null, code: string): T {
  if (value === null) throw new PromotionError(code, 'NOT_FOUND', 'Resource was not found.');
  return value;
}

function serializePromotion(value: PromotionDetail) {
  return {
    ...value,
    activatedAt: value.activatedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function serializeCoupon(value: CouponDetail) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    endsAt: value.endsAt?.toISOString() ?? null,
    startsAt: value.startsAt?.toISOString() ?? null,
  };
}
function fingerprint(operation: string, id: string | null, body: unknown): string {
  return createHash('sha256').update(stableJson({ body, id, operation })).digest('hex');
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}
function encodeCursor(kind: string, filterHash: string, createdAt: Date, id: string): string {
  const payload = Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), filterHash, id, kind, version: 1 }),
  ).toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-promotions-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}
function decodeCursor(value: string, kind: string, filterHash: string) {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256')
      .update(`sergod-promotions-cursor-v1\0${payload}`)
      .digest();
    const actual = Buffer.from(checksum, 'base64url');
    if (
      actual.toString('base64url') !== checksum ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version !== 1 ||
      parsed.kind !== kind ||
      parsed.filterHash !== filterHash ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    )
      throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt)
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new PromotionError('PROMOTIONS_CURSOR_INVALID', 'VALIDATION', 'Cursor is invalid.');
  }
}
