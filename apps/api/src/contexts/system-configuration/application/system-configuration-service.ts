import { createHash, timingSafeEqual } from 'node:crypto';

import {
  configurationRegistry,
  type ConfigurationKey,
  type CreateSystemConfiguration,
  type EditSystemConfiguration,
  type SystemConfigurationState,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import {
  normalizeConfigurationReason,
  requiredConfigurationDefinition,
  SystemConfigurationError,
  validateConfigurationValue,
} from '../domain/system-configuration.js';
import type {
  SystemConfigurationAdminAuthorizer,
  SystemConfigurationRepository,
  SystemConfigurationView,
} from './ports.js';

export class SystemConfigurationService {
  constructor(
    private readonly repository: SystemConfigurationRepository,
    private readonly authorizer: SystemConfigurationAdminAuthorizer,
  ) {}

  async listDefinitions(context: ExecutionContext) {
    await this.authorize(context);
    return { items: configurationRegistry.map((definition) => ({ ...definition })) };
  }

  async listVersions(
    context: ExecutionContext,
    input: {
      readonly configurationKey?: ConfigurationKey;
      readonly cursor?: string;
      readonly limit: number;
      readonly state?: SystemConfigurationState;
    },
  ) {
    await this.authorize(context);
    const filterHash = fingerprint('LIST', null, {
      configurationKey: input.configurationKey ?? null,
      state: input.state ?? null,
    });
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filterHash);
    const page = await this.repository.list({
      limit: input.limit,
      ...(input.configurationKey === undefined ? {} : { configurationKey: input.configurationKey }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serialize),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor(filterHash, last.createdAt, last.systemConfigurationId)
          : null,
    };
  }

  async getVersion(context: ExecutionContext, id: string) {
    await this.authorize(context);
    return serialize(await this.requiredVersion(id));
  }

  async getActive(context: ExecutionContext, key: ConfigurationKey) {
    await this.authorize(context);
    const value = await this.repository.findActive(key);
    if (value === null) throw notFound();
    return serialize(value);
  }

  async createVersion(context: ExecutionContext, body: CreateSystemConfiguration) {
    await this.authorizeMutation(context);
    const definition = requiredConfigurationDefinition(body.configurationKey);
    const value = validateConfigurationValue(definition, body.value);
    const reason = normalizeConfigurationReason(body.reason);
    const result = await this.repository.createVersion({
      configurationKey: body.configurationKey,
      context,
      idempotencyKey: requiredKey(context),
      reason,
      requestFingerprint: fingerprint('CREATE', null, {
        configurationKey: body.configurationKey,
        reason,
        value,
      }),
      value,
    });
    return {
      item: await this.getVersion(context, result.systemConfigurationId),
      replayed: result.replayed,
    };
  }

  async editDraft(context: ExecutionContext, id: string, body: EditSystemConfiguration) {
    await this.authorizeMutation(context);
    const current = await this.requiredVersion(id);
    const definition = requiredConfigurationDefinition(current.configurationKey);
    const value = validateConfigurationValue(definition, body.value);
    const reason = normalizeConfigurationReason(body.reason);
    const result = await this.repository.updateDraft({
      context,
      idempotencyKey: requiredKey(context),
      reason,
      requestFingerprint: fingerprint('EDIT', id, { reason, value }),
      systemConfigurationId: id,
      value,
    });
    return { item: await this.getVersion(context, id), replayed: result.replayed };
  }

  async transition(
    context: ExecutionContext,
    id: string,
    body: { readonly nextState: 'ACTIVE' | 'RETIRED'; readonly reason: string },
  ) {
    await this.authorizeMutation(context);
    const current = await this.requiredVersion(id);
    validateConfigurationValue(
      requiredConfigurationDefinition(current.configurationKey),
      current.value,
    );
    const reason = normalizeConfigurationReason(body.reason);
    const common = {
      context,
      idempotencyKey: requiredKey(context),
      reason,
      requestFingerprint: fingerprint('TRANSITION', id, { nextState: body.nextState, reason }),
      systemConfigurationId: id,
    };
    const result =
      body.nextState === 'ACTIVE'
        ? await this.repository.activate(common)
        : await this.repository.retire(common);
    return { item: await this.getVersion(context, id), replayed: result.replayed };
  }

  private async authorize(context: ExecutionContext) {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new SystemConfigurationError(
        'SYSTEM_CONFIGURATION_ACCESS_DENIED',
        'VALIDATION',
        'Access is not available.',
      );
    }
    await this.authorizer.assertCanManageSystemConfigurations(context);
  }

  private async authorizeMutation(context: ExecutionContext) {
    await this.authorize(context);
    requiredKey(context);
  }

  private async requiredVersion(id: string): Promise<SystemConfigurationView> {
    const value = await this.repository.findById(id);
    if (value === null) throw notFound();
    return value;
  }
}

function serialize(value: SystemConfigurationView) {
  return {
    ...value,
    activatedAt: value.activatedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    retiredAt: value.retiredAt?.toISOString() ?? null,
  };
}

function requiredKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (key === undefined || !/^[\x21-\x7e]{1,255}$/u.test(key)) {
    throw new SystemConfigurationError(
      'SYSTEM_CONFIGURATION_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'A valid Idempotency-Key is required.',
    );
  }
  return key;
}

function notFound(): SystemConfigurationError {
  return new SystemConfigurationError(
    'SYSTEM_CONFIGURATION_NOT_FOUND',
    'NOT_FOUND',
    'System configuration was not found.',
  );
}

function fingerprint(operation: string, id: string | null, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ body, id, operation })).digest('hex');
}

function encodeCursor(filterHash: string, createdAt: Date, id: string): string {
  const payload = Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), filterHash, id, version: 1 }),
  ).toString('base64url');
  return `${payload}.${createHash('sha256').update(`sergod-system-configuration-cursor-v1\0${payload}`).digest('base64url')}`;
}

function decodeCursor(value: string, filterHash: string) {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256')
      .update(`sergod-system-configuration-cursor-v1\0${payload}`)
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
    throw new SystemConfigurationError(
      'SYSTEM_CONFIGURATION_CURSOR_INVALID',
      'VALIDATION',
      'Cursor is invalid.',
    );
  }
}
