import type {
  CouponState,
  CreateCoupon,
  PromotionConfiguration,
  PromotionState,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface PromotionsAdminAuthorizer {
  assertCanManagePromotions(context: ExecutionContext): Promise<void>;
}

export interface PromotionDetail extends PromotionConfiguration {
  readonly activatedAt: Date | null;
  readonly createdAt: Date;
  readonly promotionId: string;
  readonly state: PromotionState;
  readonly updatedAt: Date;
}

export interface CouponDetail {
  readonly couponId: string;
  readonly createdAt: Date;
  readonly endsAt: Date | null;
  readonly globalLimit: number | null;
  readonly normalizedCode: string;
  readonly perAccountLimit: number | null;
  readonly promotionId: string;
  readonly startsAt: Date | null;
  readonly state: CouponState;
}

export interface PromotionPageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface PromotionsRepository {
  createCoupon(input: {
    readonly context: ExecutionContext;
    readonly coupon: Omit<CreateCoupon, 'code'> & { readonly normalizedCode: string };
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly couponId: string; readonly replayed: boolean }>;
  createPromotion(input: {
    readonly configuration: PromotionConfiguration;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly promotionId: string; readonly replayed: boolean }>;
  expireDue(
    context: ExecutionContext,
    now: Date,
  ): Promise<{ readonly coupons: number; readonly promotions: number }>;
  findCoupon(couponId: string): Promise<CouponDetail | null>;
  findPromotion(promotionId: string): Promise<PromotionDetail | null>;
  listCoupons(input: {
    readonly cursor?: PromotionPageCursor;
    readonly limit: number;
    readonly promotionId?: string;
    readonly state?: CouponState;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly CouponDetail[] }>;
  listPromotions(input: {
    readonly activationMode?: PromotionConfiguration['activationMode'];
    readonly cursor?: PromotionPageCursor;
    readonly limit: number;
    readonly state?: PromotionState;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly PromotionDetail[] }>;
  transitionCoupon(input: {
    readonly context: ExecutionContext;
    readonly couponId: string;
    readonly idempotencyKey: string;
    readonly nextState: CouponState;
    readonly requestFingerprint: string;
    readonly source?: 'ADMIN' | 'SCHEDULED_JOB';
  }): Promise<{ readonly couponId: string; readonly replayed: boolean }>;
  transitionPromotion(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly nextState: PromotionState;
    readonly promotionId: string;
    readonly requestFingerprint: string;
    readonly source?: 'ADMIN' | 'SCHEDULED_JOB';
  }): Promise<{ readonly promotionId: string; readonly replayed: boolean }>;
  updatePromotion(input: {
    readonly configuration: PromotionConfiguration;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly promotionId: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly promotionId: string; readonly replayed: boolean }>;
}
