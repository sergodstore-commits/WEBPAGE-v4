import type {
  CreatePreorderCampaign,
  EditPreorderCampaign,
  PreorderOperationalState,
  PreorderPublicationStatus,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface PreordersAdminAuthorizer {
  assertCanManagePreorders(context: ExecutionContext): Promise<void>;
}

export interface CampaignView {
  readonly branchId: string;
  readonly capacity: number;
  readonly closesAt: Date;
  readonly committed: number;
  readonly createdAt: Date;
  readonly estimatedArrivalText: string;
  readonly fulfillmentGroupKey: string | null;
  readonly opensAt: Date;
  readonly operationalState: PreorderOperationalState;
  readonly preorderCampaignId: string;
  readonly productId: string;
  readonly publicationStatus: PreorderPublicationStatus;
  readonly publishedAt: Date | null;
  readonly temporarilyReserved: number;
  readonly unpublishedAt: Date | null;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface PageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface PreordersRepository {
  createCampaign(input: {
    readonly campaign: CreatePreorderCampaign;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly campaignId: string; readonly replayed: boolean }>;
  editCampaign(input: {
    readonly campaign: EditPreorderCampaign;
    readonly campaignId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly campaignId: string; readonly replayed: boolean }>;
  findCampaign(campaignId: string): Promise<CampaignView | null>;
  listCampaigns(input: {
    readonly branchId?: string;
    readonly cursor?: PageCursor;
    readonly limit: number;
    readonly operationalState?: PreorderOperationalState;
    readonly productId?: string;
    readonly publicationStatus?: PreorderPublicationStatus;
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly CampaignView[] }>;
  processLifecycle(
    context: ExecutionContext,
    now: Date,
  ): Promise<{
    readonly closed: number;
    readonly failed: number;
    readonly opened: number;
    readonly scanned: number;
  }>;
  transitionOperational(input: {
    readonly campaignId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly nextState: PreorderOperationalState;
    readonly reason: string | null;
    readonly requestFingerprint: string;
    readonly source: 'ADMIN' | 'SCHEDULED_JOB';
  }): Promise<{ readonly campaignId: string; readonly replayed: boolean }>;
  transitionPublication(input: {
    readonly campaignId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly nextStatus: 'PUBLISHED' | 'UNPUBLISHED';
    readonly reason: string | null;
    readonly requestFingerprint: string;
  }): Promise<{ readonly campaignId: string; readonly replayed: boolean }>;
}
