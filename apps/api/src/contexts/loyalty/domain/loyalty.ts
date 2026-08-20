export type LoyaltyErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class LoyaltyError extends Error {
  constructor(
    readonly code: string,
    readonly category: LoyaltyErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LoyaltyError';
  }
}

export function availablePoints(balance: number, reservedPoints: number): number {
  integer(balance, 'balance');
  nonnegative(reservedPoints, 'reservedPoints');
  return safe(BigInt(balance) - BigInt(reservedPoints), 'available points');
}

export function calculateEarn(input: {
  readonly accountLinked: boolean;
  readonly earnClpPerPoint: number;
  readonly merchandiseSubtotalClp: number;
  readonly pointsDiscountClp: number;
  readonly promotionDiscountClp: number;
  readonly shippingFeeClp: number;
}) {
  const subtotal = money(input.merchandiseSubtotalClp, 'merchandiseSubtotalClp');
  const promotions = money(input.promotionDiscountClp, 'promotionDiscountClp');
  const points = money(input.pointsDiscountClp, 'pointsDiscountClp');
  money(input.shippingFeeClp, 'shippingFeeClp');
  const rate = positive(input.earnClpPerPoint, 'earnClpPerPoint');
  const eligible = maximumZero(BigInt(subtotal) - BigInt(promotions) - BigInt(points));
  return {
    loyaltyEligibleAmountClp: safe(eligible, 'loyalty eligible amount'),
    pointsEarned: input.accountLinked ? safe(eligible / BigInt(rate), 'earned points') : 0,
  };
}

export function calculateRedeem(input: {
  readonly balance: number;
  readonly maximumRedeemBasisPoints: number | null;
  readonly merchandiseSubtotalClp: number;
  readonly minimumRedeemPoints: number;
  readonly promotionDiscountClp: number;
  readonly redeemClpPerPoint: number;
  readonly requestedPoints: number;
  readonly reservedPoints: number;
  readonly shippingFeeClp: number;
}) {
  const subtotal = money(input.merchandiseSubtotalClp, 'merchandiseSubtotalClp');
  const promotions = money(input.promotionDiscountClp, 'promotionDiscountClp');
  money(input.shippingFeeClp, 'shippingFeeClp');
  const rate = positive(input.redeemClpPerPoint, 'redeemClpPerPoint');
  const minimum = nonnegative(input.minimumRedeemPoints, 'minimumRedeemPoints');
  const requested = nonnegative(input.requestedPoints, 'requestedPoints');
  const available = availablePoints(input.balance, input.reservedPoints);
  const base = maximumZero(BigInt(subtotal) - BigInt(promotions));
  const configuredMaximum =
    input.maximumRedeemBasisPoints === null
      ? base
      : (base * BigInt(basisPoints(input.maximumRedeemBasisPoints))) / 10_000n;
  const maximum = safe(
    (base < configuredMaximum ? base : configuredMaximum) / BigInt(rate),
    'maximum redeemable points',
  );
  if (requested > 0 && input.balance < 0) throw conflict('LOYALTY_DEBT_BLOCKS_REDEEM');
  if (requested > 0 && requested < minimum) throw validation('LOYALTY_MINIMUM_REDEEM_NOT_MET');
  if (requested > maximum) throw conflict('LOYALTY_REDEEM_LIMIT_EXCEEDED');
  if (requested > available) throw conflict('LOYALTY_AVAILABLE_POINTS_INSUFFICIENT');
  return {
    availablePoints: available,
    maxRedeemablePoints: maximum,
    pointsDiscountClp: safe(BigInt(requested) * BigInt(rate), 'points discount'),
    redeemBaseClp: safe(base, 'redeem base'),
  };
}

export function assertCanCreateReservation(input: {
  readonly balance: number;
  readonly points: number;
  readonly reservedPoints: number;
}): void {
  const points = positive(input.points, 'points');
  if (input.balance < 0) throw conflict('LOYALTY_DEBT_BLOCKS_RESERVATION');
  if (points > availablePoints(input.balance, input.reservedPoints)) {
    throw conflict('LOYALTY_AVAILABLE_POINTS_INSUFFICIENT');
  }
}

export function cancellationLoyaltyEffects(input: {
  readonly originalPointsEarned: number;
  readonly originalPointsRedeemed: number;
}) {
  return {
    earnedPointsToReverse: nonnegative(input.originalPointsEarned, 'originalPointsEarned'),
    pointsToRestore: nonnegative(input.originalPointsRedeemed, 'originalPointsRedeemed'),
  };
}

export function assertAdminCorrection(currentBalance: number, pointsSigned: number): number {
  integer(currentBalance, 'currentBalance');
  integer(pointsSigned, 'pointsSigned');
  if (pointsSigned === 0) throw validation('LOYALTY_CORRECTION_ZERO');
  const next = safe(BigInt(currentBalance) + BigInt(pointsSigned), 'corrected balance');
  if (currentBalance >= 0 && next < 0) throw conflict('LOYALTY_CORRECTION_NEGATIVE_BALANCE');
  if (currentBalance < 0 && (next < currentBalance || next > 0))
    throw conflict('LOYALTY_CORRECTION_DEBT_RANGE_INVALID');
  return next;
}

function money(value: number, field: string): number {
  return nonnegative(value, field);
}
function integer(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) throw validation(`LOYALTY_${field.toUpperCase()}_INVALID`);
  return value;
}
function nonnegative(value: number, field: string): number {
  integer(value, field);
  if (value < 0) throw validation(`LOYALTY_${field.toUpperCase()}_INVALID`);
  return value;
}
function positive(value: number, field: string): number {
  nonnegative(value, field);
  if (value === 0) throw validation(`LOYALTY_${field.toUpperCase()}_INVALID`);
  return value;
}
function basisPoints(value: number): number {
  integer(value, 'maximumRedeemBasisPoints');
  if (value < 1 || value > 10_000) throw validation('LOYALTY_BASIS_POINTS_INVALID');
  return value;
}
function maximumZero(value: bigint): bigint {
  return value < 0n ? 0n : value;
}
function safe(value: bigint, field: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw validation(`LOYALTY_${field.toUpperCase().replaceAll(' ', '_')}_OUT_OF_RANGE`);
  }
  return Number(value);
}
function validation(code: string): LoyaltyError {
  return new LoyaltyError(code, 'VALIDATION', 'Loyalty input is invalid.');
}
function conflict(code: string): LoyaltyError {
  return new LoyaltyError(code, 'CONFLICT', 'Loyalty requirements conflict with the request.');
}
