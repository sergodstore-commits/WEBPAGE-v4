import type {
  AppliedPromotionSnapshotV1,
  CouponState,
  PromotionConfiguration,
  PromotionPreview,
  PromotionState,
} from '@sergod/contracts';

export type PromotionErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class PromotionError extends Error {
  constructor(
    readonly code: string,
    readonly category: PromotionErrorCategory,
    message: string,
  ) {
    super(message);
  }
}

export function normalizePromotionName(value: string): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (normalized === '') throw validation('PROMOTION_NAME_REQUIRED', 'Promotion name is required.');
  return normalized;
}

export function normalizeCouponCode(value: string): string {
  const normalized = value.normalize('NFC').trim().toLocaleUpperCase('und');
  if (normalized === '') throw validation('COUPON_CODE_REQUIRED', 'Coupon code is required.');
  return normalized;
}

export function assertPromotionConfiguration(configuration: PromotionConfiguration): void {
  const startsAt = instant(configuration.startsAt);
  const endsAt = instant(configuration.endsAt);
  if (startsAt >= endsAt)
    throw validation('PROMOTION_WINDOW_INVALID', 'Promotion window is invalid.');
  assertUniquePositions(configuration.targets.map((target) => `${target.side}:${target.position}`));
  assertUniquePositions(
    configuration.schedules.map((schedule) => `${schedule.dayOfWeek}:${schedule.position}`),
  );
  const sides = new Set(configuration.targets.map((target) => target.side));
  if (configuration.benefit.type === 'BUY_X_GET_Y') {
    if (!sides.has('BENEFITED') || !sides.has('QUALIFYING') || !sides.has('REWARD')) {
      throw validation(
        'PROMOTION_TARGETS_INVALID',
        'BUY_X_GET_Y requires benefited, qualifying and reward targets.',
      );
    }
  } else if (sides.size !== 1 || !sides.has('BENEFITED')) {
    throw validation(
      'PROMOTION_TARGETS_INVALID',
      'Ordinary benefits require benefited targets only.',
    );
  }
}

export function assertPromotionEditable(state: PromotionState, startsAt: string, now: Date): void {
  if (state === 'DRAFT') return;
  if (state === 'SCHEDULED' && now.getTime() < instant(startsAt)) return;
  throw new PromotionError(
    'PROMOTION_COMMERCIAL_FIELDS_IMMUTABLE',
    'CONFLICT',
    'Promotion commercial fields are immutable in the current state.',
  );
}

export function nextPromotionState(
  current: PromotionState,
  requested: PromotionState,
  startsAt: string,
  endsAt: string,
  now: Date,
  source: 'ADMIN' | 'SCHEDULED_JOB' = 'ADMIN',
): PromotionState {
  if (current === requested) throw transitionError();
  const allowed: Readonly<Record<PromotionState, readonly PromotionState[]>> = {
    ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
    CANCELLED: [],
    DRAFT: ['SCHEDULED', 'ACTIVE', 'CANCELLED'],
    EXPIRED: [],
    SCHEDULED: ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'],
    SUSPENDED: ['SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED'],
  };
  if (!allowed[current].includes(requested)) throw transitionError();
  const time = now.getTime();
  const start = instant(startsAt);
  const end = instant(endsAt);
  if (requested === 'SCHEDULED' && time >= start) throw transitionError();
  if (requested === 'ACTIVE') {
    if (time < start || time >= end) throw transitionError();
    if (current === 'SCHEDULED' && source !== 'SCHEDULED_JOB') throw transitionError();
  }
  if (requested === 'EXPIRED' && (source !== 'SCHEDULED_JOB' || time < end)) {
    throw transitionError();
  }
  return requested;
}

export function nextCouponState(
  current: CouponState,
  requested: CouponState,
  startsAt: string | null,
  endsAt: string | null,
  now: Date,
  source: 'ADMIN' | 'SCHEDULED_JOB' = 'ADMIN',
): CouponState {
  if (current === requested) throw transitionError('COUPON_STATE_TRANSITION_INVALID');
  const allowed: Readonly<Record<CouponState, readonly CouponState[]>> = {
    ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
    CANCELLED: [],
    DRAFT: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    EXPIRED: [],
    SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
  };
  if (!allowed[current].includes(requested))
    throw transitionError('COUPON_STATE_TRANSITION_INVALID');
  const time = now.getTime();
  if (requested === 'ACTIVE' && endsAt !== null && time >= instant(endsAt)) {
    throw transitionError('COUPON_STATE_TRANSITION_INVALID');
  }
  if (
    requested === 'EXPIRED' &&
    (source !== 'SCHEDULED_JOB' || endsAt === null || time < instant(endsAt))
  ) {
    throw transitionError('COUPON_STATE_TRANSITION_INVALID');
  }
  if (startsAt !== null) instant(startsAt);
  return requested;
}

export type CouponEvaluationStatus =
  | 'APPLIED'
  | 'INVALID'
  | 'LIMIT_REACHED'
  | 'NOT_APPLIED'
  | 'NOT_CURRENT'
  | 'NOT_ELIGIBLE'
  | 'NOT_PROVIDED';

export interface PromotionEvaluationResult {
  readonly couponStatus: CouponEvaluationStatus;
  readonly snapshots: readonly AppliedPromotionSnapshotV1[];
  readonly totalDiscountAmountClp: number;
  readonly usageIntention: null | {
    readonly couponCountsOnce: boolean;
    readonly promotionCountsOnce: true;
  };
}

export interface PromotionSetEvaluationResult {
  readonly couponStatuses: Readonly<Record<string, CouponEvaluationStatus>>;
  readonly snapshots: readonly AppliedPromotionSnapshotV1[];
  readonly totalDiscountAmountClp: number;
}

interface Unit {
  readonly categoryId: string;
  readonly gameId: string;
  readonly lineId: string;
  readonly productId: string;
  readonly unitId: string;
  readonly unitIndex: number;
  readonly unitPriceClp: number;
}

export function evaluatePromotion(input: PromotionPreview): PromotionEvaluationResult {
  assertPromotionConfiguration(input.promotion);
  const couponStatus = evaluateCoupon(input);
  if (!eligiblePromotion(input, couponStatus)) return emptyEvaluation(couponStatus);
  const units = expandUnits(input).filter((unit) => !input.excludedLineIds.includes(unit.lineId));
  const candidate = buildCandidate(input, units);
  if (candidate === null)
    return emptyEvaluation(couponStatus === 'APPLIED' ? 'NOT_ELIGIBLE' : couponStatus);
  return {
    couponStatus: input.promotion.activationMode === 'COUPON_REQUIRED' ? 'APPLIED' : 'NOT_PROVIDED',
    snapshots: [candidate],
    totalDiscountAmountClp: candidate.totalDiscountAmountClp,
    usageIntention: {
      couponCountsOnce: input.promotion.activationMode === 'COUPON_REQUIRED',
      promotionCountsOnce: true,
    },
  };
}

export function evaluatePromotionSet(
  inputs: readonly PromotionPreview[],
): PromotionSetEvaluationResult {
  const promotionIds = inputs.map((input) => input.promotion.promotionId);
  if (new Set(promotionIds).size !== promotionIds.length) {
    throw validation('PROMOTION_CANDIDATE_DUPLICATED', 'Promotion candidates must be unique.');
  }
  if (inputs.filter((input) => input.coupon !== null || input.couponCode !== null).length > 1) {
    throw validation('COUPON_ATTEMPT_DUPLICATED', 'Only one Coupon may be attempted.');
  }
  const evaluated = inputs.map((input) => ({
    createdAt: input.promotion.createdAt,
    input,
    result: evaluatePromotion(input),
  }));
  const candidates = evaluated.filter(
    (
      item,
    ): item is typeof item & {
      readonly result: PromotionEvaluationResult & {
        readonly snapshots: readonly [AppliedPromotionSnapshotV1];
      };
    } => item.result.snapshots.length === 1,
  );
  let best: typeof candidates = [];
  const visit = (index: number, chosen: typeof candidates): void => {
    if (index === candidates.length) {
      if (compareSelections(chosen, best) > 0) best = [...chosen];
      return;
    }
    visit(index + 1, chosen);
    const candidate = candidates[index];
    if (candidate !== undefined && compatible(candidate, chosen))
      visit(index + 1, [...chosen, candidate]);
  };
  visit(0, []);
  const snapshots = [...best]
    .sort(candidateOrder)
    .map((item) => item.result.snapshots[0])
    .filter((snapshot): snapshot is AppliedPromotionSnapshotV1 => snapshot !== undefined);
  const winningPromotionIds = new Set(snapshots.map((snapshot) => snapshot.promotionId));
  return {
    couponStatuses: Object.fromEntries(
      evaluated.map((item) => [
        item.input.promotion.promotionId,
        item.result.couponStatus === 'APPLIED' &&
        !winningPromotionIds.has(item.input.promotion.promotionId)
          ? 'NOT_APPLIED'
          : item.result.couponStatus,
      ]),
    ),
    snapshots,
    totalDiscountAmountClp: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.totalDiscountAmountClp,
      0,
    ),
  };
}

function compatible(
  candidate: {
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  },
  selected: readonly {
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  }[],
): boolean {
  const snapshot = candidate.result.snapshots[0];
  const existing = selected.map((item) => item.result.snapshots[0]);
  if (snapshot.scope === 'ORDER') return existing.length === 0;
  if (existing.some((item) => item.scope === 'ORDER')) return false;
  const lines = new Set(snapshot.claimedUnits.map(unitLineId));
  return existing.every((item) =>
    item.claimedUnits.every((unitId) => !lines.has(unitLineId(unitId))),
  );
}

function compareSelections(
  left: readonly {
    readonly createdAt: string;
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  }[],
  right: readonly {
    readonly createdAt: string;
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  }[],
): number {
  const total = (items: typeof left) =>
    items.reduce((sum, item) => sum + item.result.totalDiscountAmountClp, 0);
  const amountDifference = total(left) - total(right);
  if (amountDifference !== 0) return amountDifference;
  const orderedLeft = [...left].sort(candidateOrder);
  const orderedRight = [...right].sort(candidateOrder);
  const maximum = Math.min(orderedLeft.length, orderedRight.length);
  for (let index = 0; index < maximum; index += 1) {
    const leftCandidate = orderedLeft[index];
    const rightCandidate = orderedRight[index];
    if (leftCandidate === undefined || rightCandidate === undefined) break;
    const comparison = candidateOrder(leftCandidate, rightCandidate);
    if (comparison !== 0) return -comparison;
  }
  if (orderedLeft.length !== orderedRight.length) return orderedRight.length - orderedLeft.length;
  return stableSelectionSignature(right).localeCompare(stableSelectionSignature(left));
}

function candidateOrder(
  left: {
    readonly createdAt: string;
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  },
  right: {
    readonly createdAt: string;
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  },
): number {
  const leftSnapshot = left.result.snapshots[0];
  const rightSnapshot = right.result.snapshots[0];
  return (
    rightSnapshot.priority - leftSnapshot.priority ||
    left.createdAt.localeCompare(right.createdAt) ||
    leftSnapshot.promotionId.localeCompare(rightSnapshot.promotionId)
  );
}

function stableSelectionSignature(
  items: readonly {
    readonly result: PromotionEvaluationResult & {
      readonly snapshots: readonly [AppliedPromotionSnapshotV1];
    };
  }[],
): string {
  return items
    .flatMap((item) =>
      item.result.snapshots[0].allocations.map(
        (allocation) =>
          `${item.result.snapshots[0].promotionId}:${allocation.lineId}:${allocation.unitIndexes.join(',')}`,
      ),
    )
    .sort()
    .join('|');
}

function eligiblePromotion(input: PromotionPreview, couponStatus: CouponEvaluationStatus): boolean {
  const promotion = input.promotion;
  if (promotion.state !== 'ACTIVE') return false;
  const now = instant(input.evaluatedAt);
  if (now < instant(promotion.startsAt) || now >= instant(promotion.endsAt)) return false;
  if (promotion.channel !== 'BOTH' && promotion.channel !== input.channel) return false;
  if (promotion.branchId !== null && promotion.branchId !== input.branchId) return false;
  if (promotion.perAccountLimit !== null && input.accountId === null) return false;
  if (limitReached(promotion.globalLimit, promotion.counters)) return false;
  if (
    promotion.perAccountLimit !== null &&
    (promotion.perAccountCounters === null ||
      limitReached(promotion.perAccountLimit, promotion.perAccountCounters))
  )
    return false;
  if (!insideSchedule(input)) return false;
  if (promotion.activationMode === 'AUTOMATIC') return input.coupon === null;
  return couponStatus === 'APPLIED';
}

function evaluateCoupon(input: PromotionPreview): CouponEvaluationStatus {
  const promotion = input.promotion;
  if (promotion.activationMode === 'AUTOMATIC')
    return input.coupon === null ? 'NOT_PROVIDED' : 'INVALID';
  const coupon = input.coupon;
  if (coupon === null) return 'NOT_PROVIDED';
  if (
    input.couponCode === null ||
    coupon.promotionId !== promotion.promotionId ||
    normalizeCouponCode(input.couponCode) !== coupon.normalizedCode
  ) {
    return 'INVALID';
  }
  if (coupon.state !== 'ACTIVE') return coupon.state === 'EXPIRED' ? 'NOT_CURRENT' : 'NOT_ELIGIBLE';
  const now = instant(input.evaluatedAt);
  if (
    (coupon.startsAt !== null && now < instant(coupon.startsAt)) ||
    (coupon.endsAt !== null && now >= instant(coupon.endsAt))
  ) {
    return 'NOT_CURRENT';
  }
  if (limitReached(promotion.globalLimit, promotion.counters)) return 'LIMIT_REACHED';
  if (
    promotion.perAccountLimit !== null &&
    (input.accountId === null ||
      promotion.perAccountCounters === null ||
      limitReached(promotion.perAccountLimit, promotion.perAccountCounters))
  )
    return 'LIMIT_REACHED';
  if (limitReached(coupon.globalLimit, coupon.counters)) return 'LIMIT_REACHED';
  if (
    coupon.perAccountLimit !== null &&
    (input.accountId === null ||
      coupon.perAccountCounters === null ||
      limitReached(coupon.perAccountLimit, coupon.perAccountCounters))
  )
    return 'LIMIT_REACHED';
  return 'APPLIED';
}

function limitReached(
  limit: number | null,
  counters: { readonly committed: number; readonly released: number; readonly reserved: number },
): boolean {
  return limit !== null && counters.reserved + counters.committed >= limit;
}

function insideSchedule(input: PromotionPreview): boolean {
  if (input.promotion.schedules.length === 0) return true;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: input.timezone,
      weekday: 'short',
    }).formatToParts(new Date(input.evaluatedAt));
  } catch {
    throw validation('PROMOTION_TIMEZONE_INVALID', 'Timezone is invalid.');
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;
  const weekdays: Readonly<Record<string, number>> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekday = weekdays[part('weekday') ?? ''];
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const localMinute = hour * 60 + minute;
  return input.promotion.schedules.some(
    (schedule) =>
      schedule.dayOfWeek === weekday &&
      localMinute >= schedule.startMinuteLocal &&
      localMinute < schedule.endMinuteLocal,
  );
}

function buildCandidate(
  input: PromotionPreview,
  allUnits: readonly Unit[],
): AppliedPromotionSnapshotV1 | null {
  if (input.promotion.scope === 'ORDER' && input.orderPromotionExcluded) return null;
  const benefit = input.promotion.benefit;
  const benefited = matchingUnits(
    allUnits,
    input.promotion.targets.filter((target) => target.side === 'BENEFITED'),
  );
  let qualifying: readonly Unit[] = [];
  let rewarded: readonly Unit[] = [];
  if (benefit.type === 'BUY_X_GET_Y') {
    qualifying = matchingUnits(
      allUnits,
      input.promotion.targets.filter((target) => target.side === 'QUALIFYING'),
    );
    const rewardMatches = matchingUnits(
      allUnits,
      input.promotion.targets.filter((target) => target.side === 'REWARD'),
    );
    const benefitedIds = new Set(benefited.map((unit) => unit.unitId));
    qualifying = qualifying.filter((unit) => benefitedIds.has(unit.unitId));
    rewarded = rewardMatches.filter((unit) => benefitedIds.has(unit.unitId));
  }
  const eligible = benefited;
  const quantity = eligible.length;
  const amount = sumClp(eligible);
  if (
    input.promotion.minimumEligibleQuantity !== null &&
    quantity < input.promotion.minimumEligibleQuantity
  )
    return null;
  if (
    input.promotion.minimumEligibleAmountClp !== null &&
    amount < input.promotion.minimumEligibleAmountClp
  )
    return null;
  let discounted: readonly Unit[];
  let discounts: readonly number[];
  if (benefit.type === 'BUY_X_GET_Y') {
    const group = chooseBuyXGetY(qualifying, rewarded, benefit.buyQuantity, benefit.getQuantity);
    qualifying = group.qualifying;
    discounted = group.rewarded;
    discounts = discounted.map((unit) => unit.unitPriceClp);
  } else {
    discounted = benefited;
    if (discounted.length === 0) return null;
    if (benefit.type === 'PERCENTAGE_DISCOUNT') {
      const totalDiscount = Number((BigInt(amount) * BigInt(benefit.basisPoints)) / 10_000n);
      discounts = allocateByLine(discounted, totalDiscount);
    } else if (benefit.type === 'FIXED_PRICE') {
      discounts = discounted.map((unit) => Math.max(0, unit.unitPriceClp - benefit.priceClp));
    } else {
      discounts = allocateByLine(discounted, Math.min(benefit.amountClp, amount));
    }
  }
  if (benefit.type === 'FIXED_PRICE') {
    const positive = discounted
      .map((unit, index) => ({ discount: discounts[index] ?? 0, unit }))
      .filter((item) => item.discount > 0);
    discounted = positive.map((item) => item.unit);
    discounts = positive.map((item) => item.discount);
  }
  const total = sumSafeIntegers(discounts);
  if (total <= 0) return null;
  const allocations = [...new Set(discounted.map((unit) => unit.lineId))].map((lineId) => ({
    discountAmountClp: discounted.reduce(
      (sum, unit, index) => sum + (unit.lineId === lineId ? (discounts[index] ?? 0) : 0),
      0,
    ),
    lineId,
    unitIndexes: discounted.filter((unit) => unit.lineId === lineId).map((unit) => unit.unitIndex),
  }));
  return {
    activationMode: input.promotion.activationMode,
    allocations,
    benefit,
    benefitedUnits: discounted.map((unit) => unit.unitId),
    branchId: input.promotion.branchId,
    channel: input.promotion.channel,
    claimedUnits: [...new Set([...qualifying, ...discounted].map((unit) => unit.unitId))].sort(),
    couponCode:
      input.promotion.activationMode === 'COUPON_REQUIRED' && input.couponCode !== null
        ? normalizeCouponCode(input.couponCode)
        : null,
    couponId:
      input.promotion.activationMode === 'COUPON_REQUIRED' && input.coupon !== null
        ? input.coupon.couponId
        : null,
    endsAt: input.promotion.endsAt,
    globalLimit: input.promotion.globalLimit,
    minimumEligibleAmountClp: input.promotion.minimumEligibleAmountClp,
    minimumEligibleQuantity: input.promotion.minimumEligibleQuantity,
    perAccountLimit: input.promotion.perAccountLimit,
    priority: input.promotion.priority,
    promotionId: input.promotion.promotionId,
    promotionVersion: input.promotion.updatedAt,
    qualifyingUnits: qualifying.map((unit) => unit.unitId),
    schedules: [...input.promotion.schedules].sort((left, right) => left.position - right.position),
    snapshot_contract: 'AppliedPromotionSnapshot.v1',
    snapshot_schema_version: 1,
    scope: input.promotion.scope,
    startsAt: input.promotion.startsAt,
    targets: [...input.promotion.targets].sort(
      (left, right) => left.position - right.position || left.side.localeCompare(right.side),
    ),
    totalDiscountAmountClp: total,
  };
}

function expandUnits(input: PromotionPreview): readonly Unit[] {
  return input.lines
    .flatMap((line) =>
      Array.from({ length: line.quantity }, (_, index) => ({
        categoryId: line.categoryId,
        gameId: line.gameId,
        lineId: line.lineId,
        productId: line.productId,
        unitId: `${line.lineId}:${String(index + 1).padStart(12, '0')}`,
        unitIndex: index + 1,
        unitPriceClp: line.unitPriceClp,
      })),
    )
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
}

function matchingUnits(
  units: readonly Unit[],
  targets: readonly PromotionConfiguration['targets'][number][],
): readonly Unit[] {
  return units.filter((unit) => targets.some((target) => targetMatches(target, unit)));
}

function targetMatches(target: PromotionConfiguration['targets'][number], unit: Unit): boolean {
  if (target.kind === 'ALL_PRODUCTS') return true;
  if (target.kind === 'PRODUCT') return target.productId === unit.productId;
  if (target.kind === 'CATEGORY') return target.categoryId === unit.categoryId;
  return target.gameId === unit.gameId;
}

function chooseBuyXGetY(
  qualifying: readonly Unit[],
  rewards: readonly Unit[],
  buy: number,
  get: number,
): { readonly qualifying: readonly Unit[]; readonly rewarded: readonly Unit[] } {
  const availableQualifying = new Map(qualifying.map((unit) => [unit.unitId, unit]));
  const rewardOrder = [...rewards].sort(
    (left, right) =>
      left.unitPriceClp - right.unitPriceClp || left.unitId.localeCompare(right.unitId),
  );
  const selected: Unit[] = [];
  const selectedQualifying: Unit[] = [];
  while (true) {
    const rewardGroup = rewardOrder
      .filter(
        (unit) =>
          availableQualifying.has(unit.unitId) ||
          !selected.some((item) => item.unitId === unit.unitId),
      )
      .slice(0, get);
    if (rewardGroup.length < get) break;
    const rewardIds = new Set(rewardGroup.map((unit) => unit.unitId));
    const paid = [...availableQualifying.values()]
      .filter((unit) => !rewardIds.has(unit.unitId))
      .sort((left, right) => left.unitId.localeCompare(right.unitId))
      .slice(0, buy);
    if (paid.length < buy) break;
    const consumedIds = new Set([...paid, ...rewardGroup].map((unit) => unit.unitId));
    for (const unit of [...paid, ...rewardGroup]) availableQualifying.delete(unit.unitId);
    selectedQualifying.push(...paid);
    selected.push(...rewardGroup);
    for (let index = rewardOrder.length - 1; index >= 0; index -= 1) {
      const unit = rewardOrder[index];
      if (unit !== undefined && consumedIds.has(unit.unitId)) rewardOrder.splice(index, 1);
    }
  }
  return { qualifying: selectedQualifying, rewarded: selected };
}

function allocateByLine(units: readonly Unit[], total: number): readonly number[] {
  if (total === 0) return units.map(() => 0);
  const grouped = new Map<string, Unit[]>();
  for (const unit of units) grouped.set(unit.lineId, [...(grouped.get(unit.lineId) ?? []), unit]);
  const lines = [...grouped.entries()].map(([lineId, lineUnits]) => ({
    base: sumClp(lineUnits),
    lineId,
    units: lineUnits,
  }));
  const base = lines.reduce((sum, line) => sum + BigInt(line.base), 0n);
  const exact = lines.map((line) => {
    const numerator = BigInt(total) * BigInt(line.base);
    return { floor: Number(numerator / base), line, remainder: numerator % base };
  });
  const remaining = total - exact.reduce((sum, item) => sum + item.floor, 0);
  const remainderOrder = [...exact].sort(
    (left, right) =>
      (left.remainder === right.remainder ? 0 : left.remainder > right.remainder ? -1 : 1) ||
      left.line.lineId.localeCompare(right.line.lineId),
  );
  const bonuses = new Set(remainderOrder.slice(0, remaining).map((item) => item.line.lineId));
  const byUnitId = new Map<string, number>();
  for (const item of exact) {
    const lineTotal = item.floor + (bonuses.has(item.line.lineId) ? 1 : 0);
    const allocations = allocateWithinUnits(item.line.units, lineTotal);
    item.line.units.forEach((unit, index) => byUnitId.set(unit.unitId, allocations[index] ?? 0));
  }
  return units.map((unit) => byUnitId.get(unit.unitId) ?? 0);
}

function allocateWithinUnits(units: readonly Unit[], total: number): readonly number[] {
  if (total === 0) return units.map(() => 0);
  const base = sumClp(units);
  const exact = units.map((unit) => {
    const numerator = BigInt(total) * BigInt(unit.unitPriceClp);
    return { floor: Number(numerator / BigInt(base)), remainder: numerator % BigInt(base), unit };
  });
  const remaining = total - exact.reduce((sum, item) => sum + item.floor, 0);
  const remainderOrder = [...exact].sort(
    (left, right) =>
      (left.remainder === right.remainder ? 0 : left.remainder > right.remainder ? -1 : 1) ||
      left.unit.unitId.localeCompare(right.unit.unitId),
  );
  const bonuses = new Set(remainderOrder.slice(0, remaining).map((item) => item.unit.unitId));
  return exact.map((item) => item.floor + (bonuses.has(item.unit.unitId) ? 1 : 0));
}

function sumClp(units: readonly Unit[]): number {
  return safeBigIntToNumber(units.reduce((sum, unit) => sum + BigInt(unit.unitPriceClp), 0n));
}

function sumSafeIntegers(values: readonly number[]): number {
  return safeBigIntToNumber(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

function safeBigIntToNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw validation('PROMOTION_AMOUNT_TOO_LARGE', 'Promotion amount exceeds the safe range.');
  }
  return Number(value);
}

function unitLineId(unitId: string): string {
  const separator = unitId.lastIndexOf(':');
  return separator < 0 ? unitId : unitId.slice(0, separator);
}

function emptyEvaluation(couponStatus: CouponEvaluationStatus): PromotionEvaluationResult {
  return { couponStatus, snapshots: [], totalDiscountAmountClp: 0, usageIntention: null };
}

function assertUniquePositions(values: readonly string[]): void {
  if (new Set(values).size !== values.length)
    throw validation('PROMOTION_POSITION_DUPLICATED', 'Positions must be unique.');
}

function instant(value: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed))
    throw validation('PROMOTION_INSTANT_INVALID', 'Instant is invalid.');
  return parsed;
}

function transitionError(code = 'PROMOTION_STATE_TRANSITION_INVALID'): PromotionError {
  return new PromotionError(code, 'CONFLICT', 'State transition is not valid.');
}

function validation(code: string, message: string): PromotionError {
  return new PromotionError(code, 'VALIDATION', message);
}
