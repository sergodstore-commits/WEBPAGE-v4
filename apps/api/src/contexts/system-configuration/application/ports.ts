import type {
  ConfigurationKey,
  SystemConfigurationState,
  SystemConfigurationValue,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface SystemConfigurationAdminAuthorizer {
  assertCanManageSystemConfigurations(context: ExecutionContext): Promise<void>;
}

export interface SystemConfigurationView {
  readonly activatedAt: Date | null;
  readonly activatedBy: string | null;
  readonly branchId: string | null;
  readonly configurationKey: ConfigurationKey;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly retiredAt: Date | null;
  readonly retiredBy: string | null;
  readonly scope: 'GLOBAL';
  readonly state: SystemConfigurationState;
  readonly systemConfigurationId: string;
  readonly value: SystemConfigurationValue;
  readonly valueType: 'INTEGER' | 'REFERENCE';
  readonly versionNumber: number;
}

interface MutationInput {
  readonly context: ExecutionContext;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly requestFingerprint: string;
}

export interface SystemConfigurationRepository {
  activate(input: MutationInput & { readonly systemConfigurationId: string }): Promise<{
    readonly replayed: boolean;
    readonly systemConfigurationId: string;
  }>;
  createVersion(
    input: MutationInput & {
      readonly configurationKey: ConfigurationKey;
      readonly value: SystemConfigurationValue;
    },
  ): Promise<{ readonly replayed: boolean; readonly systemConfigurationId: string }>;
  findActive(configurationKey: ConfigurationKey): Promise<SystemConfigurationView | null>;
  findById(systemConfigurationId: string): Promise<SystemConfigurationView | null>;
  list(input: {
    readonly configurationKey?: ConfigurationKey;
    readonly cursor?: { readonly createdAt: Date; readonly id: string };
    readonly limit: number;
    readonly state?: SystemConfigurationState;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly SystemConfigurationView[] }>;
  retire(input: MutationInput & { readonly systemConfigurationId: string }): Promise<{
    readonly replayed: boolean;
    readonly systemConfigurationId: string;
  }>;
  updateDraft(
    input: MutationInput & {
      readonly systemConfigurationId: string;
      readonly value: SystemConfigurationValue;
    },
  ): Promise<{ readonly replayed: boolean; readonly systemConfigurationId: string }>;
}
