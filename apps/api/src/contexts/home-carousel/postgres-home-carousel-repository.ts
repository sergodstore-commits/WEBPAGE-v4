import { createHash } from 'node:crypto';

import {
  homeCarouselMaximumSlides,
  type HomeCarouselList,
  type HomeCarouselSlide,
} from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResult, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../platform/persistence/postgres.js';
import type { CatalogPublicResourceRecord } from '../catalog/application/catalog-public-ports.js';
import { CatalogError } from '../catalog/domain/catalog.js';
import type { HomeCarouselRepository } from './home-carousel-service.js';

export class PgHomeCarouselRepository implements HomeCarouselRepository {
  private readonly transactions: PgTransactionExecutor;
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.transactions = new PgTransactionExecutor(pool);
  }

  async list(publicOnly: boolean): Promise<HomeCarouselList> {
    return list(this.pool, publicOnly);
  }

  async resource(
    slideId: string,
    publicOnly: boolean,
  ): Promise<CatalogPublicResourceRecord | null> {
    const result = await this.pool.query<CatalogPublicResourceRecord>(
      `SELECT r.resource_id AS "resourceId",r.byte_size::integer AS "byteSize",
        r.mime_type_real AS "mimeTypeReal",r.secure_storage_key AS "secureStorageKey",r.sha256_hex AS "sha256Hex"
       FROM home_carousel_slides s JOIN resource_assets r USING(resource_id)
       WHERE s.slide_id=$1 AND (NOT $2::boolean OR s.active) AND r.state='ACTIVE'`,
      [slideId, publicOnly],
    );
    return result.rows[0] ?? null;
  }

  async create(context: ExecutionContext, input: Parameters<HomeCarouselRepository['create']>[1]) {
    await this.mutate(context, 'CREATE', input.fingerprint, async (tx) => {
      const current = await list(tx, false);
      if (current.items.length >= homeCarouselMaximumSlides)
        throw conflict('El carrusel admite hasta 24 imágenes.');
      const id = this.uuids.generate();
      await tx.query(
        `INSERT INTO home_carousel_slides(slide_id,resource_id,alt_text,link_path,active,position,
        created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$8)`,
        [
          id,
          input.resourceId,
          input.altText,
          input.linkPath,
          input.active,
          current.items.length + 1,
          context.actorId,
          this.clock.now(),
        ],
      );
      return id;
    });
  }

  async update(
    context: ExecutionContext,
    slideId: string,
    input: Parameters<HomeCarouselRepository['update']>[2],
  ) {
    await this.mutate(context, 'UPDATE', hash({ slideId, ...input }), async (tx) => {
      const result = await tx.query(
        `UPDATE home_carousel_slides SET alt_text=$2,link_path=$3,active=$4,
        version=version+1,updated_by=$5,updated_at=$6 WHERE slide_id=$1 AND version=$7 RETURNING slide_id`,
        [
          slideId,
          input.altText,
          input.linkPath,
          input.active,
          context.actorId,
          this.clock.now(),
          input.expectedVersion,
        ],
      );
      if (result.rowCount !== 1)
        throw conflict('La imagen cambió. Recarga el carrusel antes de guardar.');
      return slideId;
    });
  }

  async reorder(
    context: ExecutionContext,
    input: Parameters<HomeCarouselRepository['reorder']>[1],
  ) {
    await this.mutate(context, 'REORDER', hash(input), async (tx) => {
      const current = await list(tx, false);
      if (
        current.revision !== input.expectedRevision ||
        current.items.length !== input.orderedSlideIds.length ||
        current.items.some((item) => !input.orderedSlideIds.includes(item.slideId))
      ) {
        throw conflict('El carrusel cambió. Recarga antes de ordenar.');
      }
      for (const [index, id] of input.orderedSlideIds.entries()) {
        await tx.query(
          `UPDATE home_carousel_slides SET position=$2,version=version+1,updated_by=$3,updated_at=$4 WHERE slide_id=$1`,
          [id, index + 1, context.actorId, this.clock.now()],
        );
      }
      return input.orderedSlideIds[0] ?? this.uuids.generate();
    });
  }

  private async mutate(
    context: ExecutionContext,
    action: string,
    fingerprint: string,
    operation: (tx: PgTransaction) => Promise<string>,
  ) {
    if (!context.idempotencyKey || !context.actorId)
      throw new CatalogError(
        'VALIDATION_FAILED',
        'VALIDATION',
        'Se requiere una operación autenticada e identificable.',
      );
    await this.transactions.execute(async (tx) => {
      // One bounded carousel: serialize additions and order changes, including their idempotent retries.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('home-carousel'))`);
      const scope = `HOME_CAROUSEL_${action}`;
      const effectiveFingerprint = hash({ fingerprint, actorId: context.actorId });
      const prior = await tx.query<{ fingerprint: string; status: string }>(
        'SELECT fingerprint,status FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2',
        [scope, context.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (
          prior.rows[0].fingerprint !== effectiveFingerprint ||
          prior.rows[0].status !== 'COMPLETED'
        )
          throw conflict('La clave de reintento ya está en uso para otra operación.');
        return;
      }
      const now = this.clock.now();
      const reference = await operation(tx);
      await tx.query(
        `INSERT INTO idempotency_records(idempotency_record_id,scope,idempotency_key,fingerprint,status,
        attempts,result_reference,source_type,source_id,created_at,updated_at,completed_at)
        VALUES($1,$2,$3,$4,'COMPLETED',1,$5,'HOME_CAROUSEL',$5,$6,$6,$6)`,
        [
          this.uuids.generate(),
          scope,
          context.idempotencyKey,
          effectiveFingerprint,
          reference,
          now,
        ],
      );
      await tx.query(
        `INSERT INTO audit_entries(audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,
        result,correlation_id,idempotency_key,occurred_at) VALUES($1,$2,$3,$4,'HOME_CAROUSEL',$5,'SUCCESS',$6,$7,$8)`,
        [
          this.uuids.generate(),
          context.actorId,
          context.actorType,
          scope,
          reference,
          context.correlationId,
          context.idempotencyKey,
          now,
        ],
      );
    });
  }
}

interface CarouselQuery {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

async function list(query: CarouselQuery, publicOnly: boolean): Promise<HomeCarouselList> {
  const result = await query.query<HomeCarouselSlide>(
    `SELECT s.slide_id AS "slideId",s.alt_text AS "altText",
    s.link_path AS "linkPath",s.active,s.position,s.version,r.width_px AS "widthPx",r.height_px AS "heightPx"
    FROM home_carousel_slides s JOIN resource_assets r USING(resource_id)
    WHERE (NOT $1::boolean OR s.active) AND r.state='ACTIVE' ORDER BY s.position,s.slide_id`,
    [publicOnly],
  );
  return { items: result.rows, revision: hash(result.rows) };
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function conflict(message: string) {
  return new CatalogError('HOME_CAROUSEL_CONFLICT', 'CONFLICT', message);
}
