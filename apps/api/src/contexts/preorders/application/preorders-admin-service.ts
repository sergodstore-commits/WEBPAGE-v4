import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CreatePreorderCampaign,
  EditPreorderCampaign,
  PreorderOperationalTransition,
  PreorderPublicationTransition,
} from '@sergod/contracts';
import type { Clock, ExecutionContext } from '@sergod/foundation';

import {
  assertCampaignWindow,
  assertPositiveQuantity,
  campaignAvailability,
  normalizeOptionalText,
  normalizeRequiredText,
  PreorderError,
} from '../domain/preorders.js';
import type { CampaignView, PreordersAdminAuthorizer, PreordersRepository } from './ports.js';

export class PreordersAdminService {
  constructor(
    private readonly repository: PreordersRepository,
    private readonly authorizer: PreordersAdminAuthorizer,
    private readonly clock: Clock,
  ) {}

  async createCampaign(context: ExecutionContext, body: CreatePreorderCampaign) {
    await this.authorizeMutation(context);
    const campaign = normalizeCampaign(body);
    const result = await this.repository.createCampaign({
      campaign,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: fingerprint('CREATE_CAMPAIGN', campaign),
    });
    return {
      item: serializeCampaign(await this.getRequiredCampaign(result.campaignId)),
      replayed: result.replayed,
    };
  }

  async editCampaign(context: ExecutionContext, campaignId: string, body: EditPreorderCampaign) {
    await this.authorizeMutation(context);
    await this.getRequiredCampaign(campaignId);
    const campaign = normalizeCampaign(body);
    const result = await this.repository.editCampaign({
      campaign,
      campaignId,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: fingerprint('EDIT_CAMPAIGN', { campaign, campaignId }),
    });
    return {
      item: serializeCampaign(await this.getRequiredCampaign(campaignId)),
      replayed: result.replayed,
    };
  }

  async getCampaign(context: ExecutionContext, campaignId: string) {
    await this.authorize(context);
    return serializeCampaign(await this.getRequiredCampaign(campaignId));
  }

  async listCampaigns(
    context: ExecutionContext,
    input: {
      readonly branchId?: string;
      readonly cursor?: string;
      readonly limit: number;
      readonly operationalState?: Parameters<
        PreordersRepository['listCampaigns']
      >[0]['operationalState'];
      readonly productId?: string;
      readonly publicationStatus?: Parameters<
        PreordersRepository['listCampaigns']
      >[0]['publicationStatus'];
    },
  ) {
    await this.authorize(context);
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, 'campaign');
    const page = await this.repository.listCampaigns({
      limit: input.limit,
      ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
      ...(input.operationalState === undefined ? {} : { operationalState: input.operationalState }),
      ...(input.productId === undefined ? {} : { productId: input.productId }),
      ...(input.publicationStatus === undefined
        ? {}
        : { publicationStatus: input.publicationStatus }),
      ...(cursor === undefined ? {} : { cursor: { createdAt: cursor.instant, id: cursor.id } }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeCampaign),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor('campaign', last.createdAt, last.preorderCampaignId)
          : null,
    };
  }

  async transitionOperational(
    context: ExecutionContext,
    campaignId: string,
    body: PreorderOperationalTransition,
  ) {
    await this.authorizeMutation(context);
    const reason = normalizeOptionalText(body.reason);
    const result = await this.repository.transitionOperational({
      campaignId,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      nextState: body.nextState,
      reason,
      requestFingerprint: fingerprint('TRANSITION_OPERATIONAL', {
        campaignId,
        nextState: body.nextState,
        reason,
      }),
      source: 'ADMIN',
    });
    return {
      item: serializeCampaign(await this.getRequiredCampaign(campaignId)),
      replayed: result.replayed,
    };
  }

  async transitionPublication(
    context: ExecutionContext,
    campaignId: string,
    body: PreorderPublicationTransition,
  ) {
    await this.authorizeMutation(context);
    const reason = normalizeOptionalText(body.reason);
    const result = await this.repository.transitionPublication({
      campaignId,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      nextStatus: body.nextStatus,
      reason,
      requestFingerprint: fingerprint('TRANSITION_PUBLICATION', {
        campaignId,
        nextStatus: body.nextStatus,
        reason,
      }),
    });
    return {
      item: serializeCampaign(await this.getRequiredCampaign(campaignId)),
      replayed: result.replayed,
    };
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new PreorderError(
        'PREORDERS_ACCESS_DENIED',
        'VALIDATION',
        'Preorder administration requires an authenticated user actor.',
      );
    }
    await this.authorizer.assertCanManagePreorders(context);
  }

  private async authorizeMutation(context: ExecutionContext): Promise<void> {
    await this.authorize(context);
    requiredIdempotencyKey(context);
  }

  private async getRequiredCampaign(campaignId: string): Promise<CampaignView> {
    const campaign = await this.repository.findCampaign(campaignId);
    if (campaign === null)
      throw new PreorderError(
        'PREORDER_CAMPAIGN_NOT_FOUND',
        'NOT_FOUND',
        'Preorder campaign was not found.',
      );
    return campaign;
  }
}

function normalizeCampaign<T extends CreatePreorderCampaign | EditPreorderCampaign>(body: T): T {
  const opensAt = new Date(body.opensAt);
  const closesAt = new Date(body.closesAt);
  assertCampaignWindow(opensAt, closesAt);
  assertPositiveQuantity(body.capacity);
  if (body.maxPerCustomer != null) assertPositiveQuantity(body.maxPerCustomer);
  return {
    ...body,
    estimatedArrivalText: normalizeRequiredText(body.estimatedArrivalText),
    fulfillmentGroupKey: normalizeOptionalText(body.fulfillmentGroupKey),
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
  };
}

function serializeCampaign(campaign: CampaignView) {
  const projection = campaignAvailability(campaign);
  return {
    ...campaign,
    ...projection,
    closesAt: campaign.closesAt.toISOString(),
    createdAt: campaign.createdAt.toISOString(),
    opensAt: campaign.opensAt.toISOString(),
    publishedAt: campaign.publishedAt?.toISOString() ?? null,
    unpublishedAt: campaign.unpublishedAt?.toISOString() ?? null,
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function requiredIdempotencyKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (!key)
    throw new PreorderError(
      'PREORDER_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Preorder mutations require an idempotency key.',
    );
  return key;
}

function fingerprint(operation: string, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ body, operation })).digest('hex');
}

function encodeCursor(scope: string, instant: Date, id: string): string {
  const payload = Buffer.from(
    JSON.stringify({ id, instant: instant.toISOString(), scope, version: 1 }),
    'utf8',
  ).toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-preorders-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}

function decodeCursor(
  value: string,
  scope: string,
): { readonly id: string; readonly instant: Date } {
  const [payload, checksum, extra] = value.split('.');
  if (payload === undefined || checksum === undefined || extra !== undefined) throw invalidCursor();
  const expected = createHash('sha256')
    .update(`sergod-preorders-cursor-v1\0${payload}`)
    .digest('base64url');
  const actualBytes = Buffer.from(checksum);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
    throw invalidCursor();
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version !== 1 ||
      parsed.scope !== scope ||
      typeof parsed.id !== 'string' ||
      typeof parsed.instant !== 'string'
    )
      throw invalidCursor();
    const instant = new Date(parsed.instant);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== parsed.instant)
      throw invalidCursor();
    return { id: parsed.id, instant };
  } catch (error) {
    if (error instanceof PreorderError) throw error;
    throw invalidCursor();
  }
}

function invalidCursor(): PreorderError {
  return new PreorderError('PREORDER_CURSOR_INVALID', 'VALIDATION', 'Preorder cursor is invalid.');
}
