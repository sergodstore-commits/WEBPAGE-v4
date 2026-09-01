import { createHash } from 'node:crypto';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import {
  deliverySnapshotSchema,
  snapshotRegistry,
  type CheckoutDeliveryIntent,
} from '@sergod/contracts';
import type { Pool } from 'pg';
import {
  PgTransactionExecutor,
  type PgTransaction,
} from '../../../platform/persistence/postgres.js';
import {
  ServiceCoverageError,
  type ServiceCoverageRepository,
} from '../application/service-coverage-service.js';
export class PgServiceCoverageRepository implements ServiceCoverageRepository {
  private readonly tx: PgTransactionExecutor;
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly ids: UuidGenerator,
  ) {
    this.tx = new PgTransactionExecutor(pool);
  }
  async command(
    context: ExecutionContext,
    payload: unknown,
    run: (t: PgTransaction, now: Date) => Promise<string>,
  ) {
    const key = context.idempotencyKey;
    if (!key)
      throw new ServiceCoverageError(
        'IDEMPOTENCY_KEY_REQUIRED',
        422,
        'Idempotency-Key is required.',
      );
    const fp = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    try {
      return await this.tx.execute(async (t) => {
        await t.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
          `SERVICE_COVERAGE:${key}`,
        ]);
        const old = await t.query<{ fingerprint: string; result_reference: string | null }>(
          `SELECT fingerprint,result_reference FROM idempotency_records WHERE scope='SERVICE_COVERAGE' AND idempotency_key=$1 FOR UPDATE`,
          [key],
        );
        if (old.rows[0]) {
          if (old.rows[0].fingerprint !== fp)
            throw new ServiceCoverageError(
              'IDEMPOTENCY_CONFLICT',
              409,
              'Idempotency key was reused.',
            );
          return { id: old.rows[0].result_reference, replayed: true };
        }
        const now = this.clock.now();
        const id = await run(t, now);
        await t.query(
          `INSERT INTO idempotency_records(idempotency_record_id,scope,idempotency_key,fingerprint,result_reference,status,source_type,source_id,attempts,completed_at,created_at,updated_at) VALUES($1,'SERVICE_COVERAGE',$2,$3,$4,'COMPLETED','SERVICE_COVERAGE',$4,1,$5,$5,$5)`,
          [this.ids.generate(), key, fp, id, now],
        );
        await t.query(
          `INSERT INTO audit_entries(audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,idempotency_key,occurred_at) VALUES($1,$2,'USER','SERVICE_COVERAGE_CHANGED','SERVICE_COVERAGE',$3,'SUCCESS',$4,$5,$6)`,
          [this.ids.generate(), context.actorId, id, context.correlationId, key, now],
        );
        return { id, replayed: false };
      });
    } catch (error) {
      if (error instanceof ServiceCoverageError) throw error;
      if (isPostgresIntegrityError(error))
        throw new ServiceCoverageError(
          'SHIPPING_CONFIGURATION_CONFLICT',
          409,
          'The operation conflicts with shipping configuration rules.',
        );
      throw error;
    }
  }
  saveServiceInfo(c: ExecutionContext, input: ReturnType<JSON['parse']>) {
    return this.command(c, input, async (t, n) => {
      const existing = await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM public_service_info WHERE branch_id=$1 FOR UPDATE`,
        [input.branchId],
      );
      const current = existing.rows[0];
      if (!current) {
        const id = this.ids.generate(),
          revisionId = this.ids.generate();
        await t.query(
          `INSERT INTO public_service_info(public_service_info_id,branch_id,public_address,opening_hours,public_contacts,directions,map_url,state,current_revision_number,current_published_revision_id,author_account_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',1,NULL,$8,$9,$9)`,
          [
            id,
            input.branchId,
            input.publicAddress,
            input.openingHours,
            input.publicContacts,
            input.directions ?? null,
            input.mapUrl ?? null,
            c.actorId,
            n,
          ],
        );
        await this.insertServiceInfoRevision(t, {
          actorId: c.actorId,
          body: serviceInfoBody(input),
          changedAt: n,
          number: 1,
          publishedAt: null,
          reason: 'INITIAL_CREATION',
          revisionId,
          sourceId: id,
          state: 'DRAFT',
          withdrawnAt: null,
        });
        return id;
      }
      if (!input.reason)
        throw new ServiceCoverageError(
          'REVISION_REASON_REQUIRED',
          422,
          'A reason is required when editing public service information.',
        );
      const previous = await this.currentServiceInfoRevision(t, current),
        revisionId = this.ids.generate(),
        number = Number(current.current_revision_number) + 1;
      await this.insertServiceInfoRevision(t, {
        actorId: c.actorId,
        body: serviceInfoBody(input),
        changedAt: n,
        number,
        publishedAt: previous.public_published_at_snapshot,
        reason: input.reason,
        revisionId,
        sourceId: current.public_service_info_id,
        state: current.state,
        withdrawnAt: previous.public_withdrawn_at_snapshot,
      });
      await t.query(
        `UPDATE public_service_info SET public_address=$2,opening_hours=$3,public_contacts=$4,directions=$5,map_url=$6,current_revision_number=$7,current_published_revision_id=CASE WHEN state='PUBLISHED' THEN $8::uuid ELSE NULL END,updated_at=$9 WHERE public_service_info_id=$1`,
        [
          current.public_service_info_id,
          input.publicAddress,
          input.openingHours,
          input.publicContacts,
          input.directions ?? null,
          input.mapUrl ?? null,
          number,
          revisionId,
          n,
        ],
      );
      return current.public_service_info_id;
    });
  }
  transitionServiceInfo(c: ExecutionContext, id: string, next: string, reason: string) {
    return this.command(c, { id, next, reason }, async (t, n) => {
      const row = await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM public_service_info WHERE public_service_info_id=$1 FOR UPDATE`,
        [id],
      );
      const x = row.rows[0];
      if (!x)
        throw new ServiceCoverageError('SERVICE_INFO_NOT_FOUND', 404, 'Service info not found.');
      const allowed: Record<string, readonly string[]> = {
        DRAFT: ['PUBLISHED'],
        PUBLISHED: ['WITHDRAWN'],
        WITHDRAWN: ['PUBLISHED'],
      };
      if (!(allowed[x.state] ?? []).includes(next))
        throw new ServiceCoverageError(
          'INVALID_STATE_TRANSITION',
          409,
          'Invalid state transition.',
        );
      const previous = await this.currentServiceInfoRevision(t, x),
        revisionId = this.ids.generate(),
        number = Number(x.current_revision_number) + 1;
      await this.insertServiceInfoRevision(t, {
        actorId: c.actorId,
        body: serviceInfoBody({
          publicAddress: x.public_address,
          openingHours: x.opening_hours,
          publicContacts: x.public_contacts,
          directions: x.directions,
          mapUrl: x.map_url,
        }),
        changedAt: n,
        number,
        publishedAt: next === 'PUBLISHED' ? n : previous.public_published_at_snapshot,
        reason,
        revisionId,
        sourceId: id,
        state: next,
        withdrawnAt: next === 'WITHDRAWN' ? n : null,
      });
      await t.query(
        `UPDATE public_service_info SET state=$2,current_revision_number=$3,current_published_revision_id=CASE WHEN $2='PUBLISHED' THEN $4::uuid ELSE NULL END,updated_at=$5 WHERE public_service_info_id=$1`,
        [id, next, number, revisionId, n],
      );
      return id;
    });
  }
  private async currentServiceInfoRevision(t: PgTransaction, info: ReturnType<JSON['parse']>) {
    const revision = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT public_published_at_snapshot,public_withdrawn_at_snapshot FROM content_revisions WHERE source_type='PUBLIC_SERVICE_INFO' AND source_id=$1 AND revision_number=$2`,
        [info.public_service_info_id, info.current_revision_number],
      )
    ).rows[0];
    if (!revision)
      throw new ServiceCoverageError(
        'SERVICE_INFO_REVISION_MISSING',
        409,
        'The current public service information revision is missing.',
      );
    return revision;
  }
  private async insertServiceInfoRevision(
    t: PgTransaction,
    input: {
      actorId: string | undefined;
      body: ReturnType<JSON['parse']>;
      changedAt: Date;
      number: number;
      publishedAt: Date | null;
      reason: string;
      revisionId: string;
      sourceId: string;
      state: string;
      withdrawnAt: Date | null;
    },
  ) {
    if (!input.actorId)
      throw new ServiceCoverageError('ACTOR_REQUIRED', 403, 'An authenticated actor is required.');
    const snapshot = snapshotRegistry.validate('ContentRevisionSnapshot.v1', {
      snapshot_contract: 'ContentRevisionSnapshot.v1',
      snapshot_schema_version: 1,
      sourceType: 'PUBLIC_SERVICE_INFO',
      sourceId: input.sourceId,
      title: 'Información pública de atención',
      summary: null,
      bodyOrDescription: input.body,
      slug: null,
      publicByline: null,
      editorialState: input.state,
      publicPublishedAt: input.publishedAt?.toISOString() ?? null,
      publicWithdrawnAt: input.withdrawnAt?.toISOString() ?? null,
      featuredOrContentPosition: null,
      authorPublicId: null,
      orderedResources: [],
    }) as ReturnType<JSON['parse']>;
    await t.query(
      `INSERT INTO content_revisions(revision_id,source_type,source_id,revision_number,snapshot_contract,snapshot_schema_version,title_snapshot,summary_snapshot,body_or_description_snapshot,slug_snapshot,public_byline_snapshot,editorial_state_snapshot,public_published_at_snapshot,public_withdrawn_at_snapshot,featured_or_content_position_snapshot,author_public_id_snapshot,ordered_resources_snapshot,changed_by,changed_at,reason) VALUES($1,'PUBLIC_SERVICE_INFO',$2,$3,'ContentRevisionSnapshot.v1',1,$4,NULL,$5,NULL,NULL,$6,$7,$8,NULL,NULL,$9,$10,$11,$12)`,
      [
        input.revisionId,
        input.sourceId,
        input.number,
        snapshot.title,
        JSON.stringify(snapshot.bodyOrDescription),
        snapshot.editorialState,
        snapshot.publicPublishedAt,
        snapshot.publicWithdrawnAt,
        JSON.stringify(snapshot.orderedResources),
        input.actorId,
        input.changedAt,
        input.reason,
      ],
    );
  }
  async list() {
    const [branches, i] = await Promise.all([
      this.pool.query(
        `SELECT branch_id,name,state FROM branches WHERE state='ACTIVE' ORDER BY created_at,branch_id`,
      ),
      this.pool.query(`SELECT * FROM public_service_info ORDER BY created_at`),
    ]);
    return {
      branches: branches.rows,
      nationwideShipping: {
        carriers: ['CHILEXPRESS', 'STARKEN'],
        coverage: 'NATIONWIDE_CHILE',
        destinationType: 'CARRIER_AGENCY',
        mode: 'SHIPPING',
        shippingCostAmountClp: 0,
        shippingIncludedInOrderTotal: false,
        shippingLabel: 'NO INCLUIDO — ENVÍO POR PAGAR',
        shippingPaymentMode: 'FREIGHT_COLLECT',
      },
      serviceInfo: i.rows,
    };
  }
  async validateProvisionalIntent(input: CheckoutDeliveryIntent) {
    if (input.mode === 'PICKUP') {
      const result = await this.pool.query<ReturnType<JSON['parse']>>(
        `SELECT branch.branch_id,branch.state branch_state,info.state info_state,
            info.current_published_revision_id,revision.revision_id
           FROM branches branch
           LEFT JOIN public_service_info info USING(branch_id)
           LEFT JOIN content_revisions revision
             ON revision.revision_id=info.current_published_revision_id
            AND revision.source_type='PUBLIC_SERVICE_INFO'
            AND revision.source_id=info.public_service_info_id
          WHERE branch.branch_id=$1`,
        [input.branchId],
      );
      const row = result.rows[0];
      const errorCodes: string[] = [];
      if (row === undefined || row.branch_state !== 'ACTIVE') {
        errorCodes.push('PICKUP_BRANCH_NOT_ACTIVE');
      }
      if (
        row === undefined ||
        row.info_state !== 'PUBLISHED' ||
        row.current_published_revision_id === null ||
        row.revision_id === null
      ) {
        errorCodes.push('PICKUP_INFORMATION_NOT_PUBLISHED');
      }
      return {
        branchId: row?.branch_id ?? input.branchId,
        errorCodes: [...new Set(errorCodes)].sort(),
      };
    }
    const branch = await this.pool.query<{ branch_id: string }>(
      `SELECT branch_id FROM branches WHERE state='ACTIVE' ORDER BY created_at,branch_id LIMIT 1`,
    );
    const branchId = branch.rows[0]?.branch_id ?? null;
    return {
      branchId,
      errorCodes: branchId === null ? ['SHIPPING_BRANCH_NOT_ACTIVE'] : [],
    };
  }

  async buildDeliverySnapshot(
    input: ReturnType<JSON['parse']>,
    orderTotalWithoutShippingClp: number,
  ) {
    if (input.mode === 'PICKUP') {
      const r = await this.pool.query<ReturnType<JSON['parse']>>(
        `SELECT i.branch_id,i.current_published_revision_id,r.body_or_description_snapshot->>'publicAddress' public_address,r.body_or_description_snapshot->>'openingHours' opening_hours FROM public_service_info i JOIN content_revisions r ON r.revision_id=i.current_published_revision_id AND r.source_type='PUBLIC_SERVICE_INFO' AND r.source_id=i.public_service_info_id WHERE i.branch_id=$1 AND i.state='PUBLISHED'`,
        [input.branchId],
      );
      const x = r.rows[0];
      if (!x)
        throw new ServiceCoverageError(
          'PICKUP_INFORMATION_NOT_PUBLISHED',
          409,
          'Pickup information is unavailable.',
        );
      return deliverySnapshotSchema.parse({
        snapshot_contract: 'DeliverySnapshot.v2',
        snapshot_schema_version: 2,
        mode: 'PICKUP',
        recipientName: input.recipientName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        capturedAt: this.clock.now().toISOString(),
        branchId: x.branch_id,
        publicAddress: x.public_address,
        publicServiceInfoRevisionId: x.current_published_revision_id,
        openingHours: x.opening_hours,
      });
    }
    return deliverySnapshotSchema.parse({
      snapshot_contract: 'DeliverySnapshot.v2',
      snapshot_schema_version: 2,
      mode: 'SHIPPING',
      recipientName: input.recipientName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      capturedAt: this.clock.now().toISOString(),
      shippingPaymentMode: 'FREIGHT_COLLECT',
      destinationType: 'CARRIER_AGENCY',
      carrier: input.carrier,
      destinationCommune: input.destinationCommune,
      agencyDestination: input.agencyDestination,
      shippingCostAmountClp: 0,
      shippingIncludedInOrderTotal: false,
      orderTotalWithoutShippingClp,
    });
  }
}
function serviceInfoBody(input: ReturnType<JSON['parse']>) {
  return {
    publicAddress: input.publicAddress,
    openingHours: input.openingHours,
    publicContacts: input.publicContacts,
    directions: input.directions ?? null,
    mapUrl: input.mapUrl ?? null,
  };
}
function isPostgresIntegrityError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['23503', '23505', '23514', '23P01'].includes(String(error.code));
}
