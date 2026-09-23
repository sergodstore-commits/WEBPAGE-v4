import { createHash } from 'node:crypto';

import {
  accountTournamentIdentifiersSchema,
  type AccountTournamentIdentifiers,
} from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import { isAuthorized, type ProtectedCapability } from '../domain/authorization.js';
import {
  assertPromotionAllowed,
  normalizeEmail,
  normalizePhone,
  type AccountRole,
  type AccountStatus,
  type PersistedLoginChannel,
  type LoginChannel,
  type VerificationStatus,
} from '../domain/identity.js';
import { IdentityAccessError } from '../application/identity-access-service.js';
import type {
  IdentityAccessRepository,
  IdentityAccountView,
  ProviderIdentity,
} from '../application/ports.js';

interface AccountRow extends QueryResultRow {
  account_id: string;
  auth_provider_user_id: string;
  current_email: string;
  current_phone: string | null;
  email_verification_status: VerificationStatus;
  phone_verification_status: VerificationStatus;
  role: AccountRole;
  status: AccountStatus;
}

interface SessionRow extends QueryResultRow {
  auth_session_id: string;
  invalidated_at: Date | null;
  login_channel: PersistedLoginChannel;
}

const INITIALIZATION_LOCK = 'sergod:identity-initialization:v1';
const ADMIN_SET_LOCK = 'sergod:active-admin-set:v1';
const BRANCH_LOCK = 'sergod:first-branch:v1';

export class PgIdentityAccessRepository implements IdentityAccessRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async provisionFirstAdmin(input: {
    readonly context: ExecutionContext;
    readonly diagnosticContext: unknown;
    readonly environmentIdentifier: string;
    readonly executionSource: 'DEPLOYMENT_COMMAND' | 'DEPLOYMENT_JOB';
    readonly idempotencyKey: string;
    readonly identity: ProviderIdentity;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }> {
    return this.#transactions.execute(async (transaction) => {
      await advisoryLock(transaction, INITIALIZATION_LOCK);
      const existing = await transaction.query<{ account_id: string; idempotency_key: string }>(
        `SELECT account_id, idempotency_key FROM system_bootstrap_records`,
      );
      if (existing.rows.length > 0) {
        const record = required(existing.rows[0]);
        if (record.idempotency_key === input.idempotencyKey) {
          return { accountId: record.account_id, replayed: true };
        }
        throw conflict('BOOTSTRAP_ALREADY_COMPLETED', 'Bootstrap has already completed.');
      }
      const accountCount = await transaction.query<{ count: string }>(
        `SELECT count(*) FROM user_accounts`,
      );
      if (required(accountCount.rows[0]).count !== '0') {
        throw conflict(
          'BOOTSTRAP_ACCOUNTS_EXIST',
          'Bootstrap is disabled after any account exists.',
        );
      }

      const now = this.clock.now();
      const accountId = this.uuids.generate();
      const bootstrapId = this.uuids.generate();
      await transaction.query(
        `INSERT INTO user_accounts (
           account_id, auth_provider_user_id, role, status, current_email, normalized_email,
           current_phone, normalized_phone, email_verification_status,
           phone_verification_status, created_at, updated_at, status_changed_at
         ) VALUES ($1, $2, 'ADMIN', 'ACTIVE', $3, $4, NULL, NULL, 'VERIFIED', 'PENDING', $5, $5, $5)`,
        [
          accountId,
          input.identity.providerUserId,
          input.identity.email,
          normalizeEmail(input.identity.email),
          now,
        ],
      );
      await transaction.query(
        `INSERT INTO system_bootstrap_records (
           bootstrap_id, environment_identifier, auth_user_id, account_id, idempotency_key,
           execution_source, correlation_id, diagnostic_context, executed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          bootstrapId,
          input.environmentIdentifier,
          input.identity.providerUserId,
          accountId,
          input.idempotencyKey,
          input.executionSource,
          input.context.correlationId,
          input.diagnosticContext,
          now,
        ],
      );
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: 'PROVISION_FIRST_ADMIN',
        resourceId: accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
      return { accountId, replayed: false };
    });
  }

  async recordBootstrapFailure(input: {
    readonly context: ExecutionContext;
    readonly reason: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, result,
         reason, correlation_id, causation_id, idempotency_key, occurred_at
       ) VALUES ($1, $2, $3, 'PROVISION_FIRST_ADMIN', 'SYSTEM_BOOTSTRAP', 'FAILURE',
                 $4, $5, $6, $7, $8)`,
      [
        this.uuids.generate(),
        input.context.actorId ?? null,
        input.context.actorType,
        input.reason,
        input.context.correlationId,
        input.context.causationId ?? null,
        input.context.idempotencyKey ?? null,
        this.clock.now(),
      ],
    );
  }

  async registerClient(input: {
    readonly acceptedLegalVersionIds: readonly string[];
    readonly context: ExecutionContext;
    readonly evidenceContext: unknown;
    readonly idempotencyKey: string;
    readonly identity: ProviderIdentity;
    readonly phone: string | null;
    readonly registrationSetFingerprint: string;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }> {
    return this.#transactions.execute(async (transaction) => {
      await advisoryLock(transaction, INITIALIZATION_LOCK);
      const requestFingerprint = sha256(
        JSON.stringify({
          email: normalizeEmail(input.identity.email),
          legal: input.acceptedLegalVersionIds,
          phone: input.phone,
        }),
      );
      const idempotency = await transaction.query<{
        fingerprint: string;
        result_reference: string | null;
        status: string;
      }>(
        `SELECT fingerprint, result_reference, status
           FROM idempotency_records
          WHERE scope = 'IDENTITY_REGISTRATION' AND idempotency_key = $1
          FOR UPDATE`,
        [input.idempotencyKey],
      );
      if (idempotency.rows.length > 0) {
        const record = required(idempotency.rows[0]);
        if (record.fingerprint !== requestFingerprint) {
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with other data.');
        }
        if (record.status === 'COMPLETED' && record.result_reference !== null) {
          return { accountId: record.result_reference, replayed: true };
        }
        throw conflict('REGISTRATION_IN_PROGRESS', 'Registration is already being processed.');
      }

      const initialized = await transaction.query<{ ready: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM system_bootstrap_records bootstrap
           WHERE EXISTS (
             SELECT 1 FROM user_accounts account
              WHERE account.account_id = bootstrap.account_id
                AND account.role = 'ADMIN' AND account.status = 'ACTIVE'
           )
         ) AS ready`,
      );
      if (!required(initialized.rows[0]).ready) {
        throw conflict('REGISTRATION_NOT_ENABLED', 'Registration is not enabled yet.');
      }

      const requiredVersions = await transaction.query<{ legal_document_version_id: string }>(
        `SELECT version.legal_document_version_id
           FROM legal_documents document
           JOIN legal_document_versions version
             ON version.legal_document_id = document.legal_document_id
            AND version.state = 'ACTIVE'
          WHERE document.state = 'ACTIVE' AND document.required_for_registration
          ORDER BY version.legal_document_version_id
          FOR SHARE OF document, version`,
      );
      const requiredIds = requiredVersions.rows.map((row) => row.legal_document_version_id).sort();
      if (!sameStringSet(requiredIds, input.acceptedLegalVersionIds)) {
        throw conflict('LEGAL_SET_CHANGED', 'The required legal document set changed.');
      }
      if (requiredIds.length === 0) {
        throw conflict(
          'LEGAL_CONFIGURATION_REQUIRED',
          'Registration requires readable legal versions.',
        );
      }

      const now = this.clock.now();
      const accountId = this.uuids.generate();
      await transaction.query(
        `INSERT INTO idempotency_records (
           idempotency_record_id, scope, idempotency_key, fingerprint, status, attempts,
           processing_started_at, created_at, updated_at
         ) VALUES ($1, 'IDENTITY_REGISTRATION', $2, $3, 'PROCESSING', 1, $4, $4, $4)`,
        [this.uuids.generate(), input.idempotencyKey, requestFingerprint, now],
      );
      await transaction.query(
        `INSERT INTO user_accounts (
           account_id, auth_provider_user_id, role, status, current_email, normalized_email,
           current_phone, normalized_phone, email_verification_status,
           phone_verification_status, created_at, updated_at, status_changed_at
         ) VALUES ($1, $2, 'CLIENTE', 'ACTIVE', $3, $4, $5, $6, $7, $8, $9, $9, $9)`,
        [
          accountId,
          input.identity.providerUserId,
          input.identity.email,
          normalizeEmail(input.identity.email),
          input.phone,
          input.phone,
          input.identity.emailVerified ? 'VERIFIED' : 'PENDING',
          'PENDING',
          now,
        ],
      );
      for (const legalVersionId of requiredIds) {
        await transaction.query(
          `INSERT INTO legal_acceptances (
             legal_acceptance_id, legal_document_version_id, account_id, accepted_at,
             acceptance_source, registration_set_fingerprint, evidence_context, correlation_id
           ) VALUES ($1, $2, $3, $4, 'REGISTRATION', $5, $6, $7)`,
          [
            this.uuids.generate(),
            legalVersionId,
            accountId,
            now,
            input.registrationSetFingerprint,
            input.evidenceContext,
            input.context.correlationId,
          ],
        );
      }
      await transaction.query(
        `UPDATE idempotency_records
            SET status = 'COMPLETED', result_reference = $3, completed_at = $4, updated_at = $4
          WHERE scope = 'IDENTITY_REGISTRATION' AND idempotency_key = $1 AND fingerprint = $2`,
        [input.idempotencyKey, requestFingerprint, accountId, now],
      );
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: 'REGISTER_CLIENT',
        resourceId: accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
      return { accountId, replayed: false };
    });
  }

  async createExternalIdentityReconciliation(input: {
    readonly context: ExecutionContext;
    readonly providerUserId: string;
  }): Promise<void> {
    const now = this.clock.now();
    await this.pool.query(
      `INSERT INTO external_identity_reconciliations (
         reconciliation_id, auth_provider_user_id, intended_action, state, attempts,
         correlation_id, created_at, updated_at
       ) VALUES ($1, $2, 'DISABLE_OR_DELETE_UNLINKED_IDENTITY', 'PENDING', 0, $3, $4, $4)
       ON CONFLICT (auth_provider_user_id) WHERE state IN ('PENDING', 'PROCESSING')
       DO NOTHING`,
      [this.uuids.generate(), input.providerUserId, input.context.correlationId, now],
    );
  }

  async claimExternalIdentityReconciliations(input: {
    readonly leaseMs: number;
    readonly limit: number;
  }): Promise<readonly { readonly providerUserId: string; readonly reconciliationId: string }[]> {
    const now = this.clock.now();
    const lease = new Date(now.getTime() + input.leaseMs);
    const result = await this.pool.query<{
      auth_provider_user_id: string;
      reconciliation_id: string;
    }>(
      `WITH candidates AS (
         SELECT reconciliation_id FROM external_identity_reconciliations
          WHERE (state = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= $1))
             OR (state = 'PROCESSING' AND lease_expires_at <= $1)
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE external_identity_reconciliations reconciliation
          SET state = 'PROCESSING', attempts = reconciliation.attempts + 1,
              processing_started_at = $1, lease_expires_at = $3, updated_at = $1
         FROM candidates
        WHERE reconciliation.reconciliation_id = candidates.reconciliation_id
       RETURNING reconciliation.reconciliation_id, reconciliation.auth_provider_user_id`,
      [now, input.limit, lease],
    );
    return result.rows.map((row) => ({
      providerUserId: row.auth_provider_user_id,
      reconciliationId: row.reconciliation_id,
    }));
  }

  async resolveExternalIdentityReconciliation(reconciliationId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE external_identity_reconciliations
          SET state = 'RESOLVED', resolved_at = $2, lease_expires_at = NULL, updated_at = $2
        WHERE reconciliation_id = $1 AND state = 'PROCESSING'`,
      [reconciliationId, this.clock.now()],
    );
    if (result.rowCount !== 1)
      throw conflict('RECONCILIATION_LEASE_LOST', 'Reconciliation lease was lost.');
  }

  async failExternalIdentityReconciliation(input: {
    readonly baseBackoffMs: number;
    readonly errorCode: string;
    readonly maxAttempts: number;
    readonly reconciliationId: string;
  }): Promise<void> {
    const now = this.clock.now();
    const result = await this.pool.query(
      `UPDATE external_identity_reconciliations
          SET state = CASE WHEN attempts >= $2 THEN 'FAILED' ELSE 'PENDING' END,
              last_error_code = $3,
              next_attempt_at = CASE WHEN attempts >= $2 THEN NULL ELSE
                $4::timestamptz + ($5 * power(2, attempts - 1)) * interval '1 millisecond' END,
              failed_at = CASE WHEN attempts >= $2 THEN $4::timestamptz ELSE NULL END,
              lease_expires_at = NULL, updated_at = $4
        WHERE reconciliation_id = $1 AND state = 'PROCESSING'`,
      [input.reconciliationId, input.maxAttempts, input.errorCode, now, input.baseBackoffMs],
    );
    if (result.rowCount !== 1)
      throw conflict('RECONCILIATION_LEASE_LOST', 'Reconciliation lease was lost.');
  }

  async findAccountByProviderUserId(providerUserId: string): Promise<IdentityAccountView | null> {
    const account = await this.pool.query<AccountRow>(
      `SELECT * FROM user_accounts WHERE auth_provider_user_id = $1`,
      [providerUserId],
    );
    const row = account.rows[0];
    return row === undefined ? null : accountView(row);
  }

  async findAuthorizationEvidence(input: {
    readonly authSessionId: string;
    readonly providerUserId: string;
  }) {
    const result = await this.pool.query<AccountRow & SessionRow>(
      `SELECT account.*, session.auth_session_id, session.login_channel, session.invalidated_at
         FROM user_accounts account
         LEFT JOIN application_sessions session
           ON session.account_id = account.account_id AND session.auth_session_id = $2
        WHERE account.auth_provider_user_id = $1`,
      [input.providerUserId, input.authSessionId],
    );
    const row = result.rows[0];
    if (row === undefined || row.auth_session_id === null) return null;
    return {
      account: accountProjection(row),
      applicationSession: {
        invalidated: row.invalidated_at !== null,
        loginChannel: row.login_channel,
      },
    };
  }

  async requireAuthorization(input: {
    readonly authSessionId: string;
    readonly capability: ProtectedCapability;
    readonly providerUserId: string;
  }) {
    const evidence = await this.findAuthorizationEvidence(input);
    if (evidence === null || !isAuthorized(evidence, input.capability)) {
      throw new IdentityAccessError('ACCESS_DENIED', 403, 'Access is not available.');
    }
    await this.pool.query(
      `UPDATE application_sessions SET last_validated_at = $2
        WHERE auth_session_id = $1 AND invalidated_at IS NULL`,
      [input.authSessionId, this.clock.now()],
    );
    return evidence;
  }

  async recordApplicationSession(input: {
    readonly accountId: string;
    readonly authSessionId: string;
    readonly channel: LoginChannel;
    readonly now: Date;
  }): Promise<void> {
    const result = await this.pool.query<{ login_channel: LoginChannel }>(
      `INSERT INTO application_sessions (
         auth_session_id, account_id, login_channel, created_at, last_validated_at
       ) VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (auth_session_id) DO UPDATE
         SET last_validated_at = EXCLUDED.last_validated_at
       WHERE application_sessions.account_id = EXCLUDED.account_id
         AND application_sessions.login_channel = EXCLUDED.login_channel
         AND application_sessions.invalidated_at IS NULL
       RETURNING login_channel`,
      [input.authSessionId, input.accountId, input.channel, input.now],
    );
    if (result.rowCount !== 1 || result.rows[0]?.login_channel !== input.channel) {
      throw conflict('SESSION_CHANNEL_CONFLICT', 'Session channel evidence is inconsistent.');
    }
  }

  async invalidateApplicationSessions(input: {
    readonly accountId: string;
    readonly reason: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE application_sessions
          SET invalidated_at = $2, invalidation_reason = $3
        WHERE account_id = $1 AND invalidated_at IS NULL`,
      [input.accountId, this.clock.now(), input.reason],
    );
  }

  async invalidateApplicationSession(input: {
    readonly authSessionId: string;
    readonly reason: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE application_sessions SET invalidated_at = $2, invalidation_reason = $3
        WHERE auth_session_id = $1 AND invalidated_at IS NULL`,
      [input.authSessionId, this.clock.now(), input.reason],
    );
  }

  async cancelContactChange(input: {
    readonly contactChangeId: string;
    readonly reason: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE account_contact_changes SET state = 'FAILED', failed_at = $2, failure_reason = $3
        WHERE contact_change_id = $1 AND state = 'PENDING'`,
      [input.contactChangeId, this.clock.now(), input.reason],
    );
  }

  async markEmailVerified(input: {
    readonly context: ExecutionContext;
    readonly providerUserId: string;
    readonly verifiedEmail: string;
  }): Promise<'EMAIL_CHANGE_CONFIRMED' | 'EMAIL_CHANGE_PENDING' | 'REGISTRATION_CONFIRMED'> {
    return this.#transactions.execute(async (transaction) => {
      const accountResult = await transaction.query<AccountRow>(
        `SELECT * FROM user_accounts WHERE auth_provider_user_id = $1 FOR UPDATE`,
        [input.providerUserId],
      );
      const account = required(accountResult.rows[0]);
      const normalized = normalizeEmail(input.verifiedEmail);
      const current = normalizeEmail(account.current_email);
      const now = this.clock.now();
      if (current === normalized) {
        const pending = await transaction.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM account_contact_changes
              WHERE account_id = $1 AND contact_type = 'EMAIL' AND state = 'PENDING'
                AND expires_at > $2
           ) AS exists`,
          [account.account_id, now],
        );
        if (required(pending.rows[0]).exists) return 'EMAIL_CHANGE_PENDING';
        await transaction.query(
          `UPDATE user_accounts SET email_verification_status = 'VERIFIED', updated_at = $2
            WHERE account_id = $1`,
          [account.account_id, now],
        );
        return 'REGISTRATION_CONFIRMED';
      }
      const change = await transaction.query<{ contact_change_id: string }>(
        `SELECT contact_change_id FROM account_contact_changes
          WHERE account_id = $1 AND contact_type = 'EMAIL' AND new_normalized_value = $2
            AND state = 'PENDING' AND expires_at > $3
          FOR UPDATE`,
        [account.account_id, normalized, now],
      );
      const contactChange = required(change.rows[0]);
      const duplicate = await transaction.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM user_accounts WHERE normalized_email = $1 AND account_id <> $2
         ) AS exists`,
        [normalized, account.account_id],
      );
      if (required(duplicate.rows[0]).exists) {
        await transaction.query(
          `UPDATE account_contact_changes SET state = 'FAILED', failed_at = $2,
             failure_reason = 'CONTACT_NOT_UNIQUE'
           WHERE contact_change_id = $1`,
          [contactChange.contact_change_id, now],
        );
        throw conflict('CONTACT_NOT_UNIQUE', 'Contact is already reserved or assigned.');
      }
      await transaction.query(
        `UPDATE user_accounts SET current_email = $2, normalized_email = $2,
           email_verification_status = 'VERIFIED', updated_at = $3 WHERE account_id = $1`,
        [account.account_id, normalized, now],
      );
      await transaction.query(
        `UPDATE account_contact_changes SET state = 'VERIFIED', verified_at = $2
          WHERE contact_change_id = $1`,
        [contactChange.contact_change_id, now],
      );
      return 'EMAIL_CHANGE_CONFIRMED';
    });
  }

  async reserveContactChange(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly expiresAt: Date;
    readonly newValue: string;
  }): Promise<string> {
    return this.#transactions.execute(async (transaction) => {
      const accountResult = await transaction.query<AccountRow>(
        `SELECT * FROM user_accounts WHERE account_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [input.accountId],
      );
      const account = required(accountResult.rows[0]);
      const newValue = normalizeEmail(input.newValue);
      const current = normalizeEmail(account.current_email);
      const now = this.clock.now();
      await transaction.query(
        `UPDATE account_contact_changes
            SET state = 'CANCELLED', cancelled_at = $2
          WHERE account_id = $1 AND contact_type = 'EMAIL' AND state = 'PENDING'`,
        [input.accountId, now],
      );
      const id = this.uuids.generate();
      try {
        await transaction.query(
          `INSERT INTO account_contact_changes (
             contact_change_id, account_id, contact_type, previous_normalized_value,
             new_normalized_value, state, expires_at, requested_at, correlation_id
           ) VALUES ($1, $2, 'EMAIL', $3, $4, 'PENDING', $5, $6, $7)`,
          [
            id,
            input.accountId,
            current,
            newValue,
            input.expiresAt,
            now,
            input.context.correlationId,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict('CONTACT_NOT_UNIQUE', 'Contact is already reserved or assigned.');
        }
        throw error;
      }
      return id;
    });
  }

  async getTournamentIdentifiers(accountId: string): Promise<AccountTournamentIdentifiers> {
    const result = await this.pool.query<{ konami_id: string | null; klu_code: string | null }>(
      `SELECT konami_id, klu_code FROM user_accounts WHERE account_id = $1 AND status = 'ACTIVE'`,
      [accountId],
    );
    const row = required(result.rows[0]);
    return { konamiId: row.konami_id, kluCode: row.klu_code };
  }

  async updateTournamentIdentifiers(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly identifiers: AccountTournamentIdentifiers;
  }): Promise<AccountTournamentIdentifiers> {
    const identifiers = accountTournamentIdentifiersSchema.parse(input.identifiers);
    return this.#transactions.execute(async (transaction) => {
      const result = await transaction.query<{ account_id: string }>(
        `UPDATE user_accounts SET konami_id = $2, klu_code = $3, updated_at = $4
          WHERE account_id = $1 AND status = 'ACTIVE' RETURNING account_id`,
        [input.accountId, identifiers.konamiId, identifiers.kluCode, this.clock.now()],
      );
      required(result.rows[0]);
      await writeAudit(transaction, this.uuids.generate(), input.context, this.clock.now(), {
        action: 'UPDATE_TOURNAMENT_IDENTIFIERS',
        resourceId: input.accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
      return identifiers;
    });
  }

  async updateOptionalPhone(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly phone: string | null;
  }): Promise<void> {
    const phone = input.phone === null ? null : normalizePhone(input.phone);
    await this.#transactions.execute(async (transaction) => {
      const account = await transaction.query<AccountRow>(
        `SELECT * FROM user_accounts WHERE account_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [input.accountId],
      );
      required(account.rows[0]);
      const now = this.clock.now();
      await transaction.query(
        `UPDATE user_accounts
            SET current_phone = $2, normalized_phone = $2,
                phone_verification_status = 'PENDING', updated_at = $3
          WHERE account_id = $1`,
        [input.accountId, phone, now],
      );
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: phone === null ? 'REMOVE_OPTIONAL_PHONE' : 'UPDATE_OPTIONAL_PHONE',
        resourceId: input.accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
    });
  }

  async changeAccountState(input: {
    readonly accountId: string;
    readonly actorAccountId: string;
    readonly context: ExecutionContext;
    readonly reason: string;
    readonly targetStatus: AccountStatus;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await advisoryLock(transaction, ADMIN_SET_LOCK);
      await assertActiveAdmin(transaction, input.actorAccountId);
      const targetResult = await transaction.query<AccountRow>(
        `SELECT * FROM user_accounts WHERE account_id = $1 FOR UPDATE`,
        [input.accountId],
      );
      const target = required(targetResult.rows[0]);
      if (target.status === input.targetStatus) return;
      if (target.role === 'ADMIN' && input.targetStatus === 'DEACTIVATED') {
        const admins = await transaction.query<{ count: string }>(
          `SELECT count(*) FROM user_accounts WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
        );
        if (required(admins.rows[0]).count === '1') {
          throw conflict('LAST_ADMIN_PROTECTED', 'The last active Admin cannot be deactivated.');
        }
      }
      const now = this.clock.now();
      await transaction.query(
        `UPDATE user_accounts
            SET status = $2, status_changed_at = $3::timestamptz, updated_at = $3::timestamptz,
                deactivated_at = CASE WHEN $2 = 'DEACTIVATED' THEN $3::timestamptz ELSE NULL END,
                deactivated_by = CASE WHEN $2 = 'DEACTIVATED' THEN $4::uuid ELSE NULL END
          WHERE account_id = $1`,
        [input.accountId, input.targetStatus, now, input.actorAccountId],
      );
      await transaction.query(
        `INSERT INTO account_state_history (
           account_state_history_id, account_id, from_status, to_status, admin_actor_id,
           reason, occurred_at, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          this.uuids.generate(),
          input.accountId,
          target.status,
          input.targetStatus,
          input.actorAccountId,
          input.reason,
          now,
          input.context.correlationId,
        ],
      );
      if (input.targetStatus === 'DEACTIVATED') {
        await transaction.query(
          `UPDATE application_sessions SET invalidated_at = $2, invalidation_reason = 'ACCOUNT_DEACTIVATED'
            WHERE account_id = $1 AND invalidated_at IS NULL`,
          [input.accountId, now],
        );
      }
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: input.targetStatus === 'DEACTIVATED' ? 'DEACTIVATE_ACCOUNT' : 'REACTIVATE_ACCOUNT',
        resourceId: input.accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
    });
  }

  async promoteToAdmin(input: {
    readonly accountId: string;
    readonly actorAccountId: string;
    readonly context: ExecutionContext;
    readonly reason: string;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const result = await transaction.query<AccountRow>(
        `SELECT * FROM user_accounts WHERE account_id = $1 FOR UPDATE`,
        [input.accountId],
      );
      const target = required(result.rows[0]);
      assertPromotionAllowed(accountProjection(target));
      const now = this.clock.now();
      await transaction.query(
        `UPDATE user_accounts SET role = 'ADMIN', updated_at = $2 WHERE account_id = $1`,
        [input.accountId, now],
      );
      await transaction.query(
        `INSERT INTO role_history (
           role_history_id, account_id, from_role, to_role, admin_actor_id, reason,
           occurred_at, correlation_id
         ) VALUES ($1, $2, 'CLIENTE', 'ADMIN', $3, $4, $5, $6)`,
        [
          this.uuids.generate(),
          input.accountId,
          input.actorAccountId,
          input.reason,
          now,
          input.context.correlationId,
        ],
      );
      await transaction.query(
        `UPDATE application_sessions SET invalidated_at = $2, invalidation_reason = 'ROLE_CHANGED_TO_ADMIN'
          WHERE account_id = $1 AND invalidated_at IS NULL`,
        [input.accountId, now],
      );
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: 'PROMOTE_CLIENT_TO_ADMIN',
        resourceId: input.accountId,
        resourceType: 'USER_ACCOUNT',
        result: 'SUCCESS',
      });
    });
  }

  async initializeFirstBranch(input: {
    readonly actorAccountId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly internalAddress: string;
    readonly name: string;
    readonly timezone: string;
  }): Promise<{ readonly branchId: string; readonly replayed: boolean }> {
    assertTimeZone(input.timezone);
    return this.#transactions.execute(async (transaction) => {
      await advisoryLock(transaction, BRANCH_LOCK);
      await assertActiveAdmin(transaction, input.actorAccountId);
      const fingerprint = sha256(
        JSON.stringify({
          internalAddress: input.internalAddress.trim(),
          name: input.name.trim(),
          timezone: input.timezone,
        }),
      );
      const prior = await transaction.query<{
        fingerprint: string;
        result_reference: string | null;
      }>(
        `SELECT fingerprint, result_reference FROM idempotency_records
          WHERE scope = 'INITIALIZE_FIRST_BRANCH' AND idempotency_key = $1 FOR UPDATE`,
        [input.idempotencyKey],
      );
      if (prior.rows.length > 0) {
        const row = required(prior.rows[0]);
        if (row.fingerprint !== fingerprint)
          throw conflict('IDEMPOTENCY_CONFLICT', 'Idempotency conflict.');
        const branchId = required(row.result_reference);
        await backfillInventoryPositions(transaction, branchId, this.clock.now());
        return { branchId, replayed: true };
      }
      const existing = await transaction.query<{ count: string }>('SELECT count(*) FROM branches');
      if (required(existing.rows[0]).count !== '0') {
        throw conflict('BRANCH_ALREADY_INITIALIZED', 'The first Branch already exists.');
      }
      const now = this.clock.now();
      const branchId = this.uuids.generate();
      await transaction.query(
        `INSERT INTO branches (
           branch_id, name, internal_address, state, timezone, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $6)`,
        [
          branchId,
          input.name.trim(),
          input.internalAddress.trim(),
          input.timezone,
          input.actorAccountId,
          now,
        ],
      );
      await backfillInventoryPositions(transaction, branchId, now);
      await transaction.query(
        `INSERT INTO idempotency_records (
           idempotency_record_id, scope, idempotency_key, fingerprint, result_reference,
           status, attempts, completed_at, created_at, updated_at
         ) VALUES ($1, 'INITIALIZE_FIRST_BRANCH', $2, $3, $4, 'COMPLETED', 1, $5, $5, $5)`,
        [this.uuids.generate(), input.idempotencyKey, fingerprint, branchId, now],
      );
      await writeAudit(transaction, this.uuids.generate(), input.context, now, {
        action: 'INITIALIZE_FIRST_BRANCH',
        resourceId: branchId,
        resourceType: 'BRANCH',
        result: 'SUCCESS',
      });
      return { branchId, replayed: false };
    });
  }

  async listAccounts(): Promise<readonly IdentityAccountView[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT * FROM user_accounts ORDER BY created_at, account_id`,
    );
    return Promise.all(
      result.rows.map((row) => this.findAccountByProviderUserId(row.auth_provider_user_id)),
    ).then((accounts) =>
      accounts.filter((account): account is IdentityAccountView => account !== null),
    );
  }

  async listPublicLegalVersions(): Promise<
    readonly {
      readonly contentLocation: string;
      readonly documentId: string;
      readonly publicTitle: string;
      readonly title: string;
      readonly versionId: string;
      readonly versionLabel: string;
    }[]
  > {
    const result = await this.pool.query<{
      content_location: string;
      legal_document_id: string;
      legal_document_version_id: string;
      public_title: string;
      title: string;
      version_label: string;
    }>(
      `SELECT document.legal_document_id, document.public_title,
              version.legal_document_version_id, version.version_label,
              version.title, version.content_location
         FROM legal_documents document
         JOIN legal_document_versions version
           ON version.legal_document_id = document.legal_document_id
          AND version.state = 'ACTIVE'
        WHERE document.state = 'ACTIVE' AND document.required_for_registration
        ORDER BY document.key_normalized`,
    );
    return result.rows.map((row) => ({
      contentLocation: row.content_location,
      documentId: row.legal_document_id,
      publicTitle: row.public_title,
      title: row.title,
      versionId: row.legal_document_version_id,
      versionLabel: row.version_label,
    }));
  }

  async createLegalDocument(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly key: string;
    readonly publicTitle: string;
    readonly purpose?: string;
    readonly requiredForRegistration: boolean;
  }): Promise<string> {
    return this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const id = this.uuids.generate();
      const now = this.clock.now();
      await transaction.query(
        `INSERT INTO legal_documents (
           legal_document_id, key_normalized, public_title, purpose,
           required_for_registration, state, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $7)`,
        [
          id,
          input.key.trim().toLowerCase(),
          input.publicTitle.trim(),
          input.purpose?.trim() || null,
          input.requiredForRegistration,
          input.actorAccountId,
          now,
        ],
      );
      await legalAudit(transaction, this.uuids, this.clock, input, 'CREATE_LEGAL_DOCUMENT', id);
      return id;
    });
  }

  async updateDraftLegalDocument(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly legalDocumentId: string;
    readonly publicTitle: string;
    readonly purpose?: string;
    readonly requiredForRegistration: boolean;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const result = await transaction.query(
        `UPDATE legal_documents SET public_title = $2, purpose = $3,
             required_for_registration = $4, updated_at = $5
          WHERE legal_document_id = $1 AND state = 'DRAFT'`,
        [
          input.legalDocumentId,
          input.publicTitle.trim(),
          input.purpose?.trim() || null,
          input.requiredForRegistration,
          this.clock.now(),
        ],
      );
      if (result.rowCount !== 1)
        throw conflict('LEGAL_DOCUMENT_NOT_DRAFT', 'Legal document is not editable.');
      await legalAudit(
        transaction,
        this.uuids,
        this.clock,
        input,
        'UPDATE_DRAFT_LEGAL_DOCUMENT',
        input.legalDocumentId,
      );
    });
  }

  async createLegalVersion(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly contentLocation: string;
    readonly legalDocumentId: string;
    readonly title: string;
    readonly versionLabel: string;
  }): Promise<string> {
    return this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const document = await transaction.query<{ state: string }>(
        `SELECT state FROM legal_documents WHERE legal_document_id = $1 FOR UPDATE`,
        [input.legalDocumentId],
      );
      if (required(document.rows[0]).state === 'RETIRED') {
        throw conflict('LEGAL_DOCUMENT_RETIRED', 'A retired definition cannot receive versions.');
      }
      const id = this.uuids.generate();
      const now = this.clock.now();
      await transaction.query(
        `INSERT INTO legal_document_versions (
           legal_document_version_id, legal_document_id, version_label, title,
           content_location, state, created_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $7)`,
        [
          id,
          input.legalDocumentId,
          input.versionLabel.trim(),
          input.title.trim(),
          input.contentLocation.trim(),
          input.actorAccountId,
          now,
        ],
      );
      await legalAudit(transaction, this.uuids, this.clock, input, 'CREATE_LEGAL_VERSION', id);
      return id;
    });
  }

  async updateDraftLegalVersion(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly contentLocation: string;
    readonly legalVersionId: string;
    readonly title: string;
    readonly versionLabel: string;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const result = await transaction.query(
        `UPDATE legal_document_versions SET version_label = $2, title = $3,
             content_location = $4, updated_at = $5
          WHERE legal_document_version_id = $1 AND state = 'DRAFT'
            AND NOT EXISTS (
              SELECT 1 FROM legal_acceptances acceptance
               WHERE acceptance.legal_document_version_id = legal_document_versions.legal_document_version_id
            )`,
        [
          input.legalVersionId,
          input.versionLabel.trim(),
          input.title.trim(),
          input.contentLocation.trim(),
          this.clock.now(),
        ],
      );
      if (result.rowCount !== 1)
        throw conflict('LEGAL_VERSION_NOT_DRAFT', 'Legal version is not editable.');
      await legalAudit(
        transaction,
        this.uuids,
        this.clock,
        input,
        'UPDATE_DRAFT_LEGAL_VERSION',
        input.legalVersionId,
      );
    });
  }

  async activateLegalVersion(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly legalVersionId: string;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const version = await transaction.query<{ legal_document_id: string; state: string }>(
        `SELECT legal_document_id, state FROM legal_document_versions
          WHERE legal_document_version_id = $1 FOR UPDATE`,
        [input.legalVersionId],
      );
      const target = required(version.rows[0]);
      if (target.state !== 'DRAFT')
        throw conflict('LEGAL_VERSION_NOT_DRAFT', 'Only DRAFT can activate.');
      const now = this.clock.now();
      await transaction.query(
        `UPDATE legal_document_versions SET state = 'RETIRED', retired_by = $2,
             retired_at = $3, updated_at = $3
          WHERE legal_document_id = $1 AND state = 'ACTIVE'`,
        [target.legal_document_id, input.actorAccountId, now],
      );
      await legalAudit(
        transaction,
        this.uuids,
        this.clock,
        input,
        'ACTIVATE_LEGAL_VERSION',
        input.legalVersionId,
      );
      await transaction.query(
        `UPDATE legal_document_versions SET state = 'ACTIVE', activated_by = $2,
             activated_at = $3, updated_at = $3
          WHERE legal_document_version_id = $1`,
        [input.legalVersionId, input.actorAccountId, now],
      );
    });
  }

  async activateLegalDocument(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly legalDocumentId: string;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const active = await transaction.query<{ count: string }>(
        `SELECT count(*) FROM legal_document_versions
          WHERE legal_document_id = $1 AND state = 'ACTIVE'`,
        [input.legalDocumentId],
      );
      if (required(active.rows[0]).count !== '1') {
        throw conflict('LEGAL_ACTIVE_VERSION_REQUIRED', 'Exactly one ACTIVE version is required.');
      }
      const result = await transaction.query(
        `UPDATE legal_documents SET state = 'ACTIVE', activated_by = $2,
             activated_at = $3, updated_at = $3
          WHERE legal_document_id = $1 AND state = 'DRAFT'`,
        [input.legalDocumentId, input.actorAccountId, this.clock.now()],
      );
      if (result.rowCount !== 1)
        throw conflict('LEGAL_DOCUMENT_NOT_DRAFT', 'Only DRAFT can activate.');
      await legalAudit(
        transaction,
        this.uuids,
        this.clock,
        input,
        'ACTIVATE_LEGAL_DOCUMENT',
        input.legalDocumentId,
      );
    });
  }

  async retireLegalDocument(input: {
    readonly actorAccountId: string;
    readonly context?: ExecutionContext;
    readonly legalDocumentId: string;
  }): Promise<void> {
    await this.#transactions.execute(async (transaction) => {
      await assertActiveAdmin(transaction, input.actorAccountId);
      const now = this.clock.now();
      await transaction.query(
        `UPDATE legal_document_versions SET state = 'RETIRED', retired_by = $2,
             retired_at = $3, updated_at = $3
          WHERE legal_document_id = $1 AND state = 'ACTIVE'`,
        [input.legalDocumentId, input.actorAccountId, now],
      );
      const result = await transaction.query(
        `UPDATE legal_documents SET state = 'RETIRED', retired_by = $2,
             retired_at = $3, updated_at = $3
          WHERE legal_document_id = $1 AND state IN ('DRAFT', 'ACTIVE')`,
        [input.legalDocumentId, input.actorAccountId, now],
      );
      if (result.rowCount !== 1)
        throw conflict('LEGAL_DOCUMENT_RETIRED', 'Definition is already retired.');
      await legalAudit(
        transaction,
        this.uuids,
        this.clock,
        input,
        'RETIRE_LEGAL_DOCUMENT',
        input.legalDocumentId,
      );
    });
  }
}

async function advisoryLock(transaction: PgTransaction, key: string): Promise<void> {
  await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [key]);
}

async function backfillInventoryPositions(
  transaction: PgTransaction,
  branchId: string,
  now: Date,
): Promise<void> {
  await transaction.query(
    `INSERT INTO inventory_positions (
       inventory_position_id, product_id, branch_id, on_hand, reserved,
       low_stock_threshold_override, version, updated_at
     )
     SELECT md5(product.product_id::text || ':' || $1::uuid::text)::uuid,
            product.product_id, $1, 0, 0, NULL, 1, $2
       FROM products product
     ON CONFLICT (product_id, branch_id) DO NOTHING`,
    [branchId, now],
  );
}

async function assertActiveAdmin(transaction: PgTransaction, accountId: string): Promise<void> {
  const result = await transaction.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_accounts WHERE account_id = $1 AND role = 'ADMIN' AND status = 'ACTIVE'
     ) AS allowed`,
    [accountId],
  );
  if (!required(result.rows[0]).allowed) {
    throw new IdentityAccessError('ADMIN_REQUIRED', 403, 'An active Admin is required.');
  }
}

async function writeAudit(
  transaction: PgTransaction,
  auditId: string,
  context: ExecutionContext,
  now: Date,
  input: {
    readonly action: string;
    readonly resourceId: string;
    readonly resourceType: string;
    readonly result: 'FAILURE' | 'SUCCESS';
  },
): Promise<void> {
  await transaction.query(
    `INSERT INTO audit_entries (
       audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
       result, correlation_id, causation_id, idempotency_key, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      auditId,
      context.actorId ?? null,
      context.actorType,
      input.action,
      input.resourceType,
      input.resourceId,
      input.result,
      context.correlationId,
      context.causationId ?? null,
      context.idempotencyKey ?? null,
      now,
    ],
  );
}

function accountProjection(row: AccountRow) {
  return {
    accountId: row.account_id,
    emailVerificationStatus: row.email_verification_status,
    role: row.role,
    status: row.status,
  } as const;
}

function accountView(row: AccountRow): IdentityAccountView {
  return {
    ...accountProjection(row),
    currentEmail: row.current_email,
    currentPhone: row.current_phone,
  };
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new IdentityAccessError('RESOURCE_NOT_FOUND', 404, 'Required resource was not found.');
  }
  return value;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function conflict(code: string, message: string): IdentityAccessError {
  return new IdentityAccessError(code, 409, message);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function assertTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch (error) {
    throw new IdentityAccessError('TIMEZONE_INVALID', 422, 'Timezone must be a valid IANA zone.', {
      cause: error,
    });
  }
}

function operationContext(
  actorId: string,
  context: ExecutionContext | undefined,
  uuids: UuidGenerator,
): ExecutionContext {
  return context ?? { actorId, actorType: 'USER', correlationId: uuids.generate() };
}

async function legalAudit(
  transaction: PgTransaction,
  uuids: UuidGenerator,
  clock: Clock,
  input: { readonly actorAccountId: string; readonly context?: ExecutionContext },
  action: string,
  resourceId: string,
): Promise<void> {
  await writeAudit(
    transaction,
    uuids.generate(),
    operationContext(input.actorAccountId, input.context, uuids),
    clock.now(),
    { action, resourceId, resourceType: 'LEGAL_RESOURCE', result: 'SUCCESS' },
  );
}
