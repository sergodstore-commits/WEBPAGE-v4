import type { CheckoutDeliveryIntent } from '@sergod/contracts';

export type CheckoutErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly category: CheckoutErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CheckoutError';
  }
}

export type DeliveryValidationStatus = 'INVALID' | 'NOT_VALIDATED' | 'VALID';

export type StoredCartDeliveryIntent =
  | {
      readonly branchId: string;
      readonly lastValidatedAt: Date | null;
      readonly mode: 'PICKUP';
      readonly validationErrorCodes: readonly string[];
      readonly validationStatus: DeliveryValidationStatus;
    }
  | {
      readonly agencyDestination: string;
      readonly carrier: 'CHILEXPRESS' | 'STARKEN';
      readonly destinationCommune: string;
      readonly destinationType: 'CARRIER_AGENCY';
      readonly lastValidatedAt: Date | null;
      readonly mode: 'SHIPPING';
      readonly recipientName: string;
      readonly shippingIncludedInOrderTotal: false;
      readonly shippingPaymentMode: 'FREIGHT_COLLECT';
      readonly validationErrorCodes: readonly string[];
      readonly validationStatus: DeliveryValidationStatus;
    };

export function normalizeCheckoutIntent(input: CheckoutDeliveryIntent): CheckoutDeliveryIntent {
  if (input.mode === 'PICKUP') {
    return { branchId: input.branchId.toLowerCase(), mode: 'PICKUP' };
  }
  return {
    agencyDestination: normalizeText(input.agencyDestination),
    carrier: input.carrier,
    destinationCommune: normalizeText(input.destinationCommune),
    destinationType: 'CARRIER_AGENCY',
    mode: 'SHIPPING',
    recipientName: normalizeText(input.recipientName),
    shippingIncludedInOrderTotal: false,
    shippingPaymentMode: 'FREIGHT_COLLECT',
  };
}

export function normalizeCommune(value: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleUpperCase('und');
}

export function requiredCheckoutIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new CheckoutError(
      'CHECKOUT_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Checkout mutation requires an idempotency key.',
    );
  }
  return normalized;
}

function normalizeText(value: string): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (normalized === '') {
    throw new CheckoutError('CHECKOUT_TEXT_REQUIRED', 'VALIDATION', 'Checkout text is required.');
  }
  return normalized;
}
