import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CreateLoyaltyConfiguration,
  EditLoyaltyConfiguration,
  LoyaltyAdminCorrection,
  LoyaltyConfigurationState,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import { availablePoints, LoyaltyError } from '../domain/loyalty.js';
import type {
  LoyaltyAccountView,
  LoyaltyAdminAuthorizer,
  LoyaltyConfigurationView,
  LoyaltyMovementView,
  LoyaltyRepository,
} from './ports.js';

export class LoyaltyService {
  constructor(
    private readonly repository: LoyaltyRepository,
    private readonly adminAuthorizer: LoyaltyAdminAuthorizer,
  ) {}

  async getOwnAccount(context: ExecutionContext) {
    const accountId = requiredActor(context);
    const account = required(
      await this.repository.findAccount(accountId),
      'LOYALTY_ACCOUNT_NOT_FOUND',
    );
    return {
      accountId: account.accountId,
      availablePoints: availablePoints(account.balance, account.reservedPoints),
      balance: account.balance,
      debt: account.balance < 0,
      reservedPoints: account.reservedPoints,
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  async listOwnMovements(context: ExecutionContext, input: PageInput) {
    return this.listAccountMovements(context, requiredActor(context), input, false);
  }

  async getAdminAccount(context: ExecutionContext, accountId: string) {
    await this.authorizeAdmin(context);
    return serializeAccount(
      required(await this.repository.findAccount(accountId), 'LOYALTY_ACCOUNT_NOT_FOUND'),
    );
  }

  async listAdminMovements(context: ExecutionContext, accountId: string, input: PageInput) {
    return this.listAccountMovements(context, accountId, input, true);
  }

  async listConfigurations(
    context: ExecutionContext,
    input: PageInput & {
      readonly branchId?: string | undefined;
      readonly state?: LoyaltyConfigurationState | undefined;
    },
  ) {
    await this.authorizeAdmin(context);
    const filterHash = fingerprint('LIST_CONFIGURATIONS', null, {
      branchId: input.branchId ?? null,
      state: input.state ?? null,
    });
    const cursor =
      input.cursor === undefined
        ? undefined
        : decodeCursor(input.cursor, 'CONFIGURATION', filterHash);
    const page = await this.repository.listConfigurations({
      limit: input.limit,
      ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeConfiguration),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor('CONFIGURATION', filterHash, last.createdAt, last.loyaltyConfigurationId)
          : null,
    };
  }

  async getConfiguration(context: ExecutionContext, id: string) {
    await this.authorizeAdmin(context);
    return serializeConfiguration(
      required(await this.repository.findConfiguration(id), 'LOYALTY_CONFIGURATION_NOT_FOUND'),
    );
  }

  async getActiveConfiguration(context: ExecutionContext, branchId: string) {
    await this.authorizeAdmin(context);
    return serializeConfiguration(
      required(
        await this.repository.findActiveConfiguration(branchId),
        'LOYALTY_CONFIGURATION_NOT_FOUND',
      ),
    );
  }

  async createConfiguration(context: ExecutionContext, body: CreateLoyaltyConfiguration) {
    await this.authorizeMutation(context);
    const result = await this.repository.createConfiguration({
      configuration: body,
      context,
      idempotencyKey: requiredKey(context),
      requestFingerprint: fingerprint('CREATE_CONFIGURATION', null, body),
    });
    return {
      item: await this.getConfiguration(context, result.loyaltyConfigurationId),
      replayed: result.replayed,
    };
  }

  async editConfiguration(context: ExecutionContext, id: string, body: EditLoyaltyConfiguration) {
    await this.authorizeMutation(context);
    const result = await this.repository.updateConfiguration({
      configuration: body,
      context,
      idempotencyKey: requiredKey(context),
      loyaltyConfigurationId: id,
      requestFingerprint: fingerprint('EDIT_CONFIGURATION', id, body),
    });
    return {
      item: await this.getConfiguration(context, result.loyaltyConfigurationId),
      replayed: result.replayed,
    };
  }

  async activateConfiguration(context: ExecutionContext, id: string) {
    await this.authorizeMutation(context);
    const result = await this.repository.activateConfiguration({
      context,
      idempotencyKey: requiredKey(context),
      loyaltyConfigurationId: id,
      requestFingerprint: fingerprint('ACTIVATE_CONFIGURATION', id, { nextState: 'ACTIVE' }),
    });
    return {
      item: await this.getConfiguration(context, result.loyaltyConfigurationId),
      replayed: result.replayed,
    };
  }

  async correctAccount(context: ExecutionContext, accountId: string, body: LoyaltyAdminCorrection) {
    await this.authorizeMutation(context);
    const reason = normalizeReason(body.reason);
    const result = await this.repository.applyAdminCorrection({
      accountId,
      context,
      idempotencyKey: requiredKey(context),
      pointsSigned: body.pointsSigned,
      reason,
      requestFingerprint: fingerprint('ADMIN_CORRECTION', accountId, {
        pointsSigned: body.pointsSigned,
        reason,
      }),
    });
    return {
      account: await this.getAdminAccount(context, accountId),
      movementId: result.movementId,
      replayed: result.replayed,
    };
  }

  private async listAccountMovements(
    context: ExecutionContext,
    accountId: string,
    input: PageInput,
    admin: boolean,
  ) {
    if (admin) await this.authorizeAdmin(context);
    else if (requiredActor(context) !== accountId)
      throw new LoyaltyError('LOYALTY_ACCESS_DENIED', 'VALIDATION', 'Access is not available.');
    required(await this.repository.findAccount(accountId), 'LOYALTY_ACCOUNT_NOT_FOUND');
    const cursor =
      input.cursor === undefined ? undefined : decodeMovementCursor(input.cursor, accountId);
    const page = await this.repository.listMovements({
      accountId,
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map((movement) => serializeMovement(movement, admin)),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeMovementCursor(accountId, last.occurredAt, last.movementId)
          : null,
    };
  }

  private async authorizeAdmin(context: ExecutionContext) {
    requiredActor(context);
    await this.adminAuthorizer.assertCanManageLoyalty(context);
  }

  private async authorizeMutation(context: ExecutionContext) {
    await this.authorizeAdmin(context);
    requiredKey(context);
  }
}

interface PageInput {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

function serializeAccount(value: LoyaltyAccountView) {
  return {
    ...value,
    availablePoints: availablePoints(value.balance, value.reservedPoints),
    debt: value.balance < 0,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function serializeConfiguration(value: LoyaltyConfigurationView) {
  return {
    ...value,
    activatedAt: value.activatedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    retiredAt: value.retiredAt?.toISOString() ?? null,
  };
}
function serializeMovement(value: LoyaltyMovementView, admin: boolean) {
  const publicFields = {
    balanceAfter: value.balanceAfter,
    movementId: value.movementId,
    occurredAt: value.occurredAt.toISOString(),
    pointsSigned: value.pointsSigned,
    reason: value.reason,
    sourceId: value.sourceId,
    sourceType: value.sourceType,
    type: value.type,
  };
  if (!admin) return publicFields;
  return {
    ...publicFields,
    actorId: value.actorId,
    earnClpPerPointSnapshot: value.earnClpPerPointSnapshot,
    loyaltyConfigurationId: value.loyaltyConfigurationId,
    loyaltyEligibleAmountSnapshot: value.loyaltyEligibleAmountSnapshot,
    redeemClpPerPointSnapshot: value.redeemClpPerPointSnapshot,
  };
}
function requiredActor(context: ExecutionContext): string {
  if (context.actorType !== 'USER' || context.actorId === undefined)
    throw new LoyaltyError('LOYALTY_ACCESS_DENIED', 'VALIDATION', 'Access is not available.');
  return context.actorId;
}
function requiredKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (key === undefined || !/^[\x21-\x7e]{1,255}$/u.test(key))
    throw new LoyaltyError(
      'LOYALTY_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'A valid Idempotency-Key is required.',
    );
  return key;
}
function required<T>(value: T | null, code: string): T {
  if (value === null) throw new LoyaltyError(code, 'NOT_FOUND', 'Loyalty resource was not found.');
  return value;
}
function normalizeReason(value: string): string {
  const reason = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (reason === '')
    throw new LoyaltyError(
      'LOYALTY_CORRECTION_REASON_REQUIRED',
      'VALIDATION',
      'Correction reason is required.',
    );
  return reason;
}
function fingerprint(operation: string, id: string | null, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ body, id, operation })).digest('hex');
}
function encodeCursor(kind: string, filterHash: string, createdAt: Date, id: string): string {
  return signedCursor('sergod-loyalty-configuration-cursor-v1', {
    createdAt: createdAt.toISOString(),
    filterHash,
    id,
    kind,
    version: 1,
  });
}
function decodeCursor(value: string, kind: string, filterHash: string) {
  const parsed = readSignedCursor(value, 'sergod-loyalty-configuration-cursor-v1');
  if (
    parsed.version !== 1 ||
    parsed.kind !== kind ||
    parsed.filterHash !== filterHash ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.id !== 'string'
  )
    throw invalidCursor();
  return { createdAt: instant(parsed.createdAt), id: parsed.id };
}
function encodeMovementCursor(accountId: string, occurredAt: Date, movementId: string): string {
  return signedCursor('sergod-loyalty-movement-cursor-v1', {
    accountId,
    movementId,
    occurredAt: occurredAt.toISOString(),
    version: 1,
  });
}
function decodeMovementCursor(value: string, accountId: string) {
  const parsed = readSignedCursor(value, 'sergod-loyalty-movement-cursor-v1');
  if (
    parsed.version !== 1 ||
    parsed.accountId !== accountId ||
    typeof parsed.occurredAt !== 'string' ||
    typeof parsed.movementId !== 'string'
  )
    throw invalidCursor();
  return { movementId: parsed.movementId, occurredAt: instant(parsed.occurredAt) };
}
function signedCursor(namespace: string, value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHash('sha256').update(`${namespace}\0${payload}`).digest('base64url')}`;
}
function readSignedCursor(value: string, namespace: string): Record<string, unknown> {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256').update(`${namespace}\0${payload}`).digest();
    const actual = Buffer.from(checksum, 'base64url');
    if (
      actual.toString('base64url') !== checksum ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error();
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw invalidCursor();
  }
}
function instant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw invalidCursor();
  return date;
}
function invalidCursor(): LoyaltyError {
  return new LoyaltyError('LOYALTY_CURSOR_INVALID', 'VALIDATION', 'Cursor is invalid.');
}
