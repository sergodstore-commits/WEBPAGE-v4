import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { ServiceCoverageService } from '../../src/contexts/service-coverage/application/service-coverage-service.js';
import { PgServiceCoverageRepository } from '../../src/contexts/service-coverage/infrastructure/postgres-service-coverage-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198c000-0000-7000-8000-000000000001',
  branch: '0198c000-0000-7000-8000-000000000002',
};
const clock = new FixedClock(new Date('2026-08-11T12:00:00.000Z'));
let pool: Pool;
let service: ServiceCoverageService;
let sequence = 0;

function context(label: string): ExecutionContext {
  return {
    actorId: ids.admin,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: `${label}-${++sequence}`,
  };
}

beforeAll(async () => {
  const url =
    process.env.DATABASE_URL ??
    (
      JSON.parse(
        (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
          /^\uFEFF/u,
          '',
        ),
      ) as { databaseUrl: string }
    ).databaseUrl;
  await runner({
    checkOrder: true,
    databaseUrl: url,
    dir: resolve('apps/api/migrations'),
    direction: 'up',
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  });
  pool = createPostgresPool(url);
  service = new ServiceCoverageService(
    new PgServiceCoverageRepository(pool, clock, new CryptoUuidGenerator()),
  );
});

beforeEach(async () => {
  sequence = 0;
  await pool.query(`
    TRUNCATE shipping_configuration_history,shipping_options,shipping_zone_communes,
      shipping_zones,content_revisions,public_service_info,branches,user_accounts,
      idempotency_records,audit_entries CASCADE
  `);
  await pool.query(
    `INSERT INTO user_accounts(account_id,auth_provider_user_id,role,status,current_email,normalized_email,current_phone,normalized_phone,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at) VALUES($1,$2,'ADMIN','ACTIVE','admin@example.test','admin@example.test',NULL,NULL,'VERIFIED','PENDING',$3,$3,$3)`,
    [ids.admin, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches(branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at) VALUES($1,'Principal','Internal','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
});

afterAll(async () => pool.end());

it('lists the active branch before public service information exists', async () => {
  await expect(service.list()).resolves.toMatchObject({
    branches: [{ branch_id: ids.branch, name: 'Principal', state: 'ACTIVE' }],
    serviceInfo: [],
  });
});

it('publishes immutable PublicServiceInfo revisions and builds PICKUP only from the revision', async () => {
  const saved = (await service.saveInfo(context('info'), {
    branchId: ids.branch,
    publicAddress: 'Public address 1',
    openingHours: 'Monday to Friday',
    publicContacts: 'contact@example.test',
    directions: null,
    mapUrl: null,
    reason: null,
  })) as { id: string };
  expect(
    (
      await pool.query(
        `SELECT revision_number,editorial_state_snapshot,reason FROM content_revisions WHERE source_id=$1`,
        [saved.id],
      )
    ).rows,
  ).toEqual([
    { revision_number: 1, editorial_state_snapshot: 'DRAFT', reason: 'INITIAL_CREATION' },
  ]);
  await service.transitionInfo(context('publish'), saved.id, 'PUBLISHED', 'Approved for pickup');
  const snapshot = await service.buildDeliverySnapshot({
    mode: 'PICKUP',
    branchId: ids.branch,
    recipientName: 'Customer',
    contactEmail: 'customer@example.test',
    contactPhone: null,
  });
  expect(snapshot).toMatchObject({
    mode: 'PICKUP',
    branchId: ids.branch,
    publicAddress: 'Public address 1',
  });
  await service.saveInfo(context('edit-info'), {
    branchId: ids.branch,
    publicAddress: 'Public address 2',
    openingHours: 'Saturday',
    publicContacts: 'contact@example.test',
    directions: null,
    mapUrl: null,
    reason: 'Updated public schedule',
  });
  const updated = await service.buildDeliverySnapshot({
    mode: 'PICKUP',
    branchId: ids.branch,
    recipientName: 'Customer',
    contactEmail: 'customer@example.test',
    contactPhone: null,
  });
  expect(updated).toMatchObject({ publicAddress: 'Public address 2', openingHours: 'Saturday' });
  expect(
    (
      await pool.query(
        `SELECT revision_number,editorial_state_snapshot,body_or_description_snapshot->>'publicAddress' public_address FROM content_revisions WHERE source_id=$1 ORDER BY revision_number`,
        [saved.id],
      )
    ).rows,
  ).toEqual([
    { revision_number: 1, editorial_state_snapshot: 'DRAFT', public_address: 'Public address 1' },
    {
      revision_number: 2,
      editorial_state_snapshot: 'PUBLISHED',
      public_address: 'Public address 1',
    },
    {
      revision_number: 3,
      editorial_state_snapshot: 'PUBLISHED',
      public_address: 'Public address 2',
    },
  ]);
  await service.transitionInfo(context('withdraw'), saved.id, 'WITHDRAWN', 'Temporarily closed');
  await expect(
    service.buildDeliverySnapshot({
      mode: 'PICKUP',
      branchId: ids.branch,
      recipientName: 'Customer',
      contactEmail: 'customer@example.test',
      contactPhone: null,
    }),
  ).rejects.toMatchObject({ code: 'PICKUP_INFORMATION_NOT_PUBLISHED' });
  expect(
    (
      await pool.query(
        `SELECT state,current_revision_number,current_published_revision_id FROM public_service_info WHERE public_service_info_id=$1`,
        [saved.id],
      )
    ).rows[0],
  ).toMatchObject({
    state: 'WITHDRAWN',
    current_revision_number: 4,
    current_published_revision_id: null,
  });
  await service.transitionInfo(context('republish'), saved.id, 'PUBLISHED', 'Service reopened');
  expect(
    (
      await pool.query(
        `SELECT revision_number,editorial_state_snapshot,reason FROM content_revisions WHERE source_id=$1 ORDER BY revision_number`,
        [saved.id],
      )
    ).rows.slice(-2),
  ).toEqual([
    { revision_number: 4, editorial_state_snapshot: 'WITHDRAWN', reason: 'Temporarily closed' },
    { revision_number: 5, editorial_state_snapshot: 'PUBLISHED', reason: 'Service reopened' },
  ]);
  expect(
    await service.buildDeliverySnapshot({
      mode: 'PICKUP',
      branchId: ids.branch,
      recipientName: 'Customer',
      contactEmail: 'customer@example.test',
      contactPhone: null,
    }),
  ).toMatchObject({ publicAddress: 'Public address 2', openingHours: 'Saturday' });
  await expect(
    pool.query(`UPDATE content_revisions SET reason='rewrite' WHERE source_id=$1`, [saved.id]),
  ).rejects.toMatchObject({ code: '55000' });
});

it('requires a reason for every persisted edit after initial creation', async () => {
  await service.saveInfo(context('info'), {
    branchId: ids.branch,
    publicAddress: 'Public address',
    openingHours: 'Monday',
    publicContacts: 'contact@example.test',
    directions: null,
    mapUrl: 'https://maps.example.test/location',
    reason: null,
  });
  await expect(
    service.saveInfo(context('edit-without-reason'), {
      branchId: ids.branch,
      publicAddress: 'Changed address',
      openingHours: 'Monday',
      publicContacts: 'contact@example.test',
      directions: null,
      mapUrl: null,
      reason: null,
    }),
  ).rejects.toMatchObject({ code: 'REVISION_REASON_REQUIRED' });
  expect(
    (await pool.query(`SELECT count(*)::int count FROM content_revisions`)).rows[0].count,
  ).toBe(1);
});

it('builds nationwide freight-collect SHIPPING with no shipping cost in the order', async () => {
  const snapshot = await service.buildDeliverySnapshot(
    {
      agencyDestination: 'Agencia centro de Copiapó',
      carrier: 'CHILEXPRESS',
      contactEmail: null,
      contactPhone: '+56911111111',
      destinationCommune: 'Copiapó',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      recipientName: 'Customer',
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    },
    10000,
  );
  expect(snapshot).toMatchObject({
    mode: 'SHIPPING',
    carrier: 'CHILEXPRESS',
    orderTotalWithoutShippingClp: 10000,
    shippingCostAmountClp: 0,
    shippingIncludedInOrderTotal: false,
  });
});
