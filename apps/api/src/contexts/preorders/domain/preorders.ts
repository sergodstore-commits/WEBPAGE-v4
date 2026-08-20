import type { PreorderOperationalState, PreorderPublicationStatus } from '@sergod/contracts';

export type PreorderErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class PreorderError extends Error {
  constructor(
    readonly code: string,
    readonly category: PreorderErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PreorderError';
  }
}

const transitions: Readonly<Record<PreorderOperationalState, readonly PreorderOperationalState[]>> =
  {
    CANCELLED: [],
    CLOSED: ['CANCELLED'],
    DRAFT: ['SCHEDULED', 'OPEN', 'CANCELLED'],
    OPEN: ['CLOSED', 'CANCELLED'],
    SCHEDULED: ['OPEN', 'CLOSED', 'CANCELLED'],
  };

export function assertCampaignWindow(opensAt: Date, closesAt: Date): void {
  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(closesAt.getTime()) ||
    opensAt >= closesAt
  ) {
    throw validation('PREORDER_WINDOW_INVALID', 'Campaign opening must be before closing.');
  }
}

export function assertOperationalTransition(input: {
  readonly current: PreorderOperationalState;
  readonly next: PreorderOperationalState;
  readonly now: Date;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly source: 'ADMIN' | 'SCHEDULED_JOB';
}): void {
  if (!transitions[input.current].includes(input.next)) {
    throw conflict('PREORDER_TRANSITION_INVALID', 'Campaign transition is not allowed.');
  }
  if (input.current === 'SCHEDULED' && input.next === 'OPEN' && input.source !== 'SCHEDULED_JOB') {
    throw conflict(
      'PREORDER_SCHEDULED_OPEN_JOB_REQUIRED',
      'A scheduled campaign is opened only by its job.',
    );
  }
  if (input.next === 'OPEN' && (input.now < input.opensAt || input.now >= input.closesAt)) {
    throw conflict(
      'PREORDER_OPEN_OUTSIDE_WINDOW',
      'Campaign cannot open outside its configured window.',
    );
  }
  if (input.source === 'SCHEDULED_JOB' && input.next === 'CLOSED' && input.now < input.closesAt) {
    throw conflict(
      'PREORDER_CLOSE_BEFORE_WINDOW_END',
      'Scheduled close cannot run before campaign end.',
    );
  }
}

export function assertPublicationTransition(input: {
  readonly current: PreorderPublicationStatus;
  readonly next: 'PUBLISHED' | 'UNPUBLISHED';
  readonly operationalState: PreorderOperationalState;
}): void {
  if (input.current === input.next) {
    throw conflict(
      'PREORDER_PUBLICATION_TRANSITION_INVALID',
      'Campaign already has that publication status.',
    );
  }
  if (input.next === 'PUBLISHED' && !['SCHEDULED', 'OPEN'].includes(input.operationalState)) {
    throw conflict(
      'PREORDER_PUBLICATION_STATE_INVALID',
      'Only scheduled or open campaigns can be published.',
    );
  }
}

export function campaignAvailability(input: {
  readonly capacity: number;
  readonly committed: number;
  readonly temporarilyReserved: number;
}) {
  const availableCapacity = input.capacity - input.temporarilyReserved - input.committed;
  if (availableCapacity < 0) {
    throw conflict('PREORDER_COUNTER_INVARIANT_VIOLATION', 'Campaign counters are inconsistent.');
  }
  return { availableCapacity };
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw validation('PREORDER_QUANTITY_INVALID', 'Quantity must be a positive safe integer.');
  }
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized === '' ? null : normalized;
}

export function normalizeRequiredText(value: string): string {
  const normalized = normalizeOptionalText(value);
  if (normalized === null)
    throw validation('PREORDER_REQUIRED_TEXT_MISSING', 'Required text is missing.');
  return normalized;
}

function validation(code: string, message: string): PreorderError {
  return new PreorderError(code, 'VALIDATION', message);
}

function conflict(code: string, message: string): PreorderError {
  return new PreorderError(code, 'CONFLICT', message);
}
