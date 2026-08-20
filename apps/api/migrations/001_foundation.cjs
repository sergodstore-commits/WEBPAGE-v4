exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE audit_entries (
      audit_entry_id uuid PRIMARY KEY,
      actor_id text,
      actor_type text NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM', 'EXTERNAL_SERVICE')),
      action text NOT NULL,
      resource_type text,
      resource_id text,
      result text NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE')),
      reason text,
      correlation_id uuid NOT NULL,
      causation_id uuid,
      idempotency_key text,
      diagnostic_context jsonb,
      occurred_at timestamptz NOT NULL
    );

    CREATE INDEX audit_entries_correlation_idx ON audit_entries (correlation_id, occurred_at);

    CREATE TABLE idempotency_records (
      idempotency_record_id uuid PRIMARY KEY,
      scope text NOT NULL,
      idempotency_key text NOT NULL,
      fingerprint text NOT NULL,
      result_reference text,
      status text NOT NULL CHECK (
        status IN ('PROCESSING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL')
      ),
      source_type text,
      source_id text,
      attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
      processing_started_at timestamptz,
      lease_expires_at timestamptz,
      last_error_code text,
      completed_at timestamptz,
      failed_at timestamptz,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      UNIQUE (scope, idempotency_key)
    );

    CREATE INDEX idempotency_recovery_idx
      ON idempotency_records (lease_expires_at)
      WHERE status = 'PROCESSING';

    CREATE TABLE outbox_events (
      event_id uuid PRIMARY KEY,
      aggregate_type text NOT NULL,
      aggregate_id text NOT NULL,
      event_type text NOT NULL,
      event_schema_version integer NOT NULL CHECK (event_schema_version > 0),
      payload_contract text NOT NULL,
      payload jsonb NOT NULL,
      correlation_id uuid NOT NULL,
      causation_id uuid,
      state text NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at timestamptz NOT NULL,
      processing_started_at timestamptz,
      lease_expires_at timestamptz,
      next_attempt_at timestamptz,
      last_error_code text,
      created_at timestamptz NOT NULL,
      processed_at timestamptz,
      failed_at timestamptz
    );

    CREATE INDEX outbox_claim_idx
      ON outbox_events (available_at, created_at)
      WHERE state = 'PENDING';
    CREATE INDEX outbox_recovery_idx
      ON outbox_events (lease_expires_at)
      WHERE state = 'PROCESSING';

    CREATE TABLE inbox_messages (
      inbox_id uuid PRIMARY KEY,
      source text NOT NULL,
      external_message_id text NOT NULL,
      message_type text NOT NULL,
      event_schema_version integer NOT NULL CHECK (event_schema_version > 0),
      payload_contract text NOT NULL,
      payload_hash text NOT NULL,
      encrypted_payload bytea NOT NULL,
      safe_headers_snapshot jsonb,
      state text NOT NULL CHECK (state IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      received_at timestamptz NOT NULL,
      processing_started_at timestamptz,
      lease_expires_at timestamptz,
      next_attempt_at timestamptz,
      last_error_code text,
      processed_at timestamptz,
      failed_at timestamptz,
      UNIQUE (source, external_message_id)
    );

    CREATE INDEX inbox_claim_idx
      ON inbox_messages (received_at)
      WHERE state = 'RECEIVED';
    CREATE INDEX inbox_recovery_idx
      ON inbox_messages (lease_expires_at)
      WHERE state = 'PROCESSING';

    CREATE TABLE scheduled_job_runs (
      scheduled_job_run_id uuid PRIMARY KEY,
      job_name text NOT NULL,
      scheduled_for timestamptz NOT NULL,
      idempotency_key text NOT NULL UNIQUE,
      state text NOT NULL CHECK (state IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
      attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
      processing_started_at timestamptz NOT NULL,
      lease_expires_at timestamptz,
      completed_at timestamptz,
      processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
      succeeded_count integer NOT NULL DEFAULT 0 CHECK (succeeded_count >= 0),
      failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
      last_error_code text,
      result_summary jsonb,
      correlation_id uuid NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      UNIQUE (job_name, scheduled_for)
    );

    CREATE INDEX scheduled_job_recovery_idx
      ON scheduled_job_runs (lease_expires_at)
      WHERE state = 'RUNNING';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE scheduled_job_runs;
    DROP TABLE inbox_messages;
    DROP TABLE outbox_events;
    DROP TABLE idempotency_records;
    DROP TABLE audit_entries;
  `);
};
