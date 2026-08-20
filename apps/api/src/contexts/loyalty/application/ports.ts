import type {
  CreateLoyaltyConfiguration,
  EditLoyaltyConfiguration,
  LoyaltyConfigurationState,
  LoyaltyMovementType,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface LoyaltyAdminAuthorizer {
  assertCanManageLoyalty(context: ExecutionContext): Promise<void>;
}

export interface LoyaltyAccountView {
  readonly accountId: string;
  readonly balance: number;
  readonly createdAt: Date;
  readonly loyaltyAccountId: string;
  readonly reservedPoints: number;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface LoyaltyConfigurationView extends CreateLoyaltyConfiguration {
  readonly activatedAt: Date | null;
  readonly activatedBy: string | null;
  readonly createdAt: Date;
  readonly createdBy: string;
  readonly loyaltyConfigurationId: string;
  readonly retiredAt: Date | null;
  readonly retiredBy: string | null;
  readonly state: LoyaltyConfigurationState;
  readonly versionNumber: number;
}

export interface LoyaltyMovementView {
  readonly actorId: string | null;
  readonly balanceAfter: number;
  readonly earnClpPerPointSnapshot: number | null;
  readonly idempotencyKey: string;
  readonly loyaltyAccountId: string;
  readonly loyaltyConfigurationId: string | null;
  readonly loyaltyEligibleAmountSnapshot: number | null;
  readonly movementId: string;
  readonly occurredAt: Date;
  readonly pointsSigned: number;
  readonly reason: string | null;
  readonly redeemClpPerPointSnapshot: number | null;
  readonly sourceId: string;
  readonly sourceType: string;
  readonly type: LoyaltyMovementType;
}

export interface LoyaltyPageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface LoyaltyRepository {
  activateConfiguration(
    input: MutationContext & { readonly loyaltyConfigurationId: string },
  ): Promise<MutationResult>;
  applyAdminCorrection(
    input: MutationContext & {
      readonly accountId: string;
      readonly pointsSigned: number;
      readonly reason: string;
    },
  ): Promise<{ readonly movementId: string; readonly replayed: boolean }>;
  createConfiguration(
    input: MutationContext & { readonly configuration: CreateLoyaltyConfiguration },
  ): Promise<MutationResult>;
  findAccount(accountId: string): Promise<LoyaltyAccountView | null>;
  findConfiguration(loyaltyConfigurationId: string): Promise<LoyaltyConfigurationView | null>;
  findActiveConfiguration(branchId: string): Promise<LoyaltyConfigurationView | null>;
  listConfigurations(input: {
    readonly branchId?: string;
    readonly cursor?: LoyaltyPageCursor;
    readonly limit: number;
    readonly state?: LoyaltyConfigurationState;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly LoyaltyConfigurationView[] }>;
  listMovements(input: {
    readonly accountId: string;
    readonly cursor?: { readonly movementId: string; readonly occurredAt: Date };
    readonly limit: number;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly LoyaltyMovementView[] }>;
  updateConfiguration(
    input: MutationContext & {
      readonly configuration: EditLoyaltyConfiguration;
      readonly loyaltyConfigurationId: string;
    },
  ): Promise<MutationResult>;
}

interface MutationContext {
  readonly context: ExecutionContext;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

interface MutationResult {
  readonly loyaltyConfigurationId: string;
  readonly replayed: boolean;
}
