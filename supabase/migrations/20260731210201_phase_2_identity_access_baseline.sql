CREATE TABLE user_accounts (
      account_id uuid PRIMARY KEY,
      auth_provider_user_id uuid NOT NULL UNIQUE,
      role text NOT NULL CHECK (role IN ('CLIENTE', 'ADMIN')),
      status text NOT NULL CHECK (status IN ('ACTIVE', 'DEACTIVATED')),
      current_email text NOT NULL,
      normalized_email text NOT NULL UNIQUE,
      current_phone text NOT NULL,
      normalized_phone text NOT NULL UNIQUE CHECK (normalized_phone ~ '^\+[1-9][0-9]{7,14}$'),
      email_verification_status text NOT NULL CHECK (email_verification_status IN ('PENDING', 'VERIFIED')),
      phone_verification_status text NOT NULL CHECK (phone_verification_status IN ('PENDING', 'VERIFIED')),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      status_changed_at timestamptz NOT NULL,
      deactivated_at timestamptz,
      deactivated_by uuid REFERENCES user_accounts(account_id),
      CHECK (
        (status = 'ACTIVE' AND deactivated_at IS NULL AND deactivated_by IS NULL) OR
        (status = 'DEACTIVATED' AND deactivated_at IS NOT NULL AND deactivated_by IS NOT NULL)
      )
    );

    CREATE TABLE system_bootstrap_records (
      bootstrap_id uuid PRIMARY KEY,
      singleton_key boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton_key),
      environment_identifier text NOT NULL,
      auth_user_id uuid NOT NULL UNIQUE,
      account_id uuid NOT NULL UNIQUE REFERENCES user_accounts(account_id),
      idempotency_key text NOT NULL UNIQUE,
      execution_source text NOT NULL CHECK (execution_source IN ('DEPLOYMENT_COMMAND', 'DEPLOYMENT_JOB')),
      correlation_id uuid NOT NULL,
      diagnostic_context jsonb NOT NULL,
      executed_at timestamptz NOT NULL
    );

    CREATE TABLE account_state_history (
      account_state_history_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      from_status text NOT NULL CHECK (from_status IN ('ACTIVE', 'DEACTIVATED')),
      to_status text NOT NULL CHECK (to_status IN ('ACTIVE', 'DEACTIVATED')),
      admin_actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
      reason text NOT NULL CHECK (length(trim(reason)) > 0),
      occurred_at timestamptz NOT NULL,
      correlation_id uuid NOT NULL,
      CHECK (from_status <> to_status)
    );

    CREATE INDEX account_state_history_account_idx
      ON account_state_history (account_id, occurred_at);

    CREATE TABLE role_history (
      role_history_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      from_role text NOT NULL CHECK (from_role IN ('CLIENTE', 'ADMIN')),
      to_role text NOT NULL CHECK (to_role IN ('CLIENTE', 'ADMIN')),
      admin_actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
      reason text NOT NULL CHECK (length(trim(reason)) > 0),
      occurred_at timestamptz NOT NULL,
      correlation_id uuid NOT NULL,
      CHECK (from_role = 'CLIENTE' AND to_role = 'ADMIN')
    );

    CREATE INDEX role_history_account_idx ON role_history (account_id, occurred_at);

    CREATE TABLE editorial_assignments (
      assignment_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      area text NOT NULL CHECK (area IN ('NEWS', 'COMMUNITY', 'COMICS', 'EVENTS', 'TOURNAMENTS', 'PUBLIC_SERVICE_INFO')),
      status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
      assigned_by uuid NOT NULL REFERENCES user_accounts(account_id),
      assigned_at timestamptz NOT NULL,
      revoked_by uuid REFERENCES user_accounts(account_id),
      revoked_at timestamptz,
      revoke_reason text,
      CHECK (
        (status = 'ACTIVE' AND revoked_by IS NULL AND revoked_at IS NULL AND revoke_reason IS NULL) OR
        (status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND length(trim(revoke_reason)) > 0)
      )
    );

    CREATE UNIQUE INDEX editorial_assignments_active_account_area_idx
      ON editorial_assignments (account_id, area) WHERE status = 'ACTIVE';

    CREATE TABLE application_sessions (
      auth_session_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      login_channel text NOT NULL CHECK (login_channel IN ('EMAIL_PASSWORD', 'PHONE_PASSWORD')),
      created_at timestamptz NOT NULL,
      last_validated_at timestamptz NOT NULL,
      invalidated_at timestamptz,
      invalidation_reason text
    );

    CREATE INDEX application_sessions_account_active_idx
      ON application_sessions (account_id) WHERE invalidated_at IS NULL;

    CREATE TABLE account_contact_changes (
      contact_change_id uuid PRIMARY KEY,
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      contact_type text NOT NULL CHECK (contact_type IN ('EMAIL', 'PHONE')),
      previous_normalized_value text NOT NULL,
      new_normalized_value text NOT NULL,
      state text NOT NULL CHECK (state IN ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELLED', 'FAILED')),
      expires_at timestamptz NOT NULL,
      requested_at timestamptz NOT NULL,
      verified_at timestamptz,
      expired_at timestamptz,
      cancelled_at timestamptz,
      failed_at timestamptz,
      failure_reason text,
      correlation_id uuid NOT NULL,
      CHECK (previous_normalized_value <> new_normalized_value),
      CHECK (contact_type <> 'PHONE' OR new_normalized_value ~ '^\+[1-9][0-9]{7,14}$'),
      CHECK (
        (state = 'PENDING' AND verified_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL) OR
        (state = 'VERIFIED' AND verified_at IS NOT NULL AND expired_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL) OR
        (state = 'EXPIRED' AND verified_at IS NULL AND expired_at IS NOT NULL AND cancelled_at IS NULL AND failed_at IS NULL) OR
        (state = 'CANCELLED' AND verified_at IS NULL AND expired_at IS NULL AND cancelled_at IS NOT NULL AND failed_at IS NULL) OR
        (state = 'FAILED' AND verified_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL AND failed_at IS NOT NULL AND length(trim(failure_reason)) > 0)
      )
    );

    CREATE UNIQUE INDEX account_contact_changes_pending_type_idx
      ON account_contact_changes (account_id, contact_type) WHERE state = 'PENDING';
    CREATE UNIQUE INDEX account_contact_changes_pending_email_idx
      ON account_contact_changes (new_normalized_value) WHERE state = 'PENDING' AND contact_type = 'EMAIL';
    CREATE UNIQUE INDEX account_contact_changes_pending_phone_idx
      ON account_contact_changes (new_normalized_value) WHERE state = 'PENDING' AND contact_type = 'PHONE';

    CREATE TABLE external_identity_reconciliations (
      reconciliation_id uuid PRIMARY KEY,
      auth_provider_user_id uuid NOT NULL,
      intended_action text NOT NULL CHECK (intended_action = 'DISABLE_OR_DELETE_UNLINKED_IDENTITY'),
      state text NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'RESOLVED', 'FAILED')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error_code text,
      next_attempt_at timestamptz,
      processing_started_at timestamptz,
      lease_expires_at timestamptz,
      resolved_at timestamptz,
      failed_at timestamptz,
      correlation_id uuid NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );

    CREATE UNIQUE INDEX external_identity_reconciliations_open_identity_idx
      ON external_identity_reconciliations (auth_provider_user_id)
      WHERE state IN ('PENDING', 'PROCESSING');

    CREATE TABLE legal_documents (
      legal_document_id uuid PRIMARY KEY,
      key_normalized text NOT NULL UNIQUE CHECK (key_normalized ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
      public_title text NOT NULL CHECK (length(trim(public_title)) > 0),
      purpose text,
      required_for_registration boolean NOT NULL,
      state text NOT NULL CHECK (state IN ('DRAFT', 'ACTIVE', 'RETIRED')),
      created_by uuid NOT NULL REFERENCES user_accounts(account_id),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      activated_by uuid REFERENCES user_accounts(account_id),
      activated_at timestamptz,
      retired_by uuid REFERENCES user_accounts(account_id),
      retired_at timestamptz,
      CHECK (
        (state = 'DRAFT' AND activated_by IS NULL AND activated_at IS NULL AND retired_by IS NULL AND retired_at IS NULL) OR
        (state = 'ACTIVE' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NULL AND retired_at IS NULL) OR
        (state = 'RETIRED' AND retired_by IS NOT NULL AND retired_at IS NOT NULL)
      )
    );

    CREATE TABLE legal_document_versions (
      legal_document_version_id uuid PRIMARY KEY,
      legal_document_id uuid NOT NULL REFERENCES legal_documents(legal_document_id),
      version_label text NOT NULL CHECK (length(trim(version_label)) > 0),
      title text NOT NULL CHECK (length(trim(title)) > 0),
      content_location text NOT NULL CHECK (length(trim(content_location)) > 0),
      state text NOT NULL CHECK (state IN ('DRAFT', 'ACTIVE', 'RETIRED')),
      created_by uuid NOT NULL REFERENCES user_accounts(account_id),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      activated_by uuid REFERENCES user_accounts(account_id),
      activated_at timestamptz,
      retired_by uuid REFERENCES user_accounts(account_id),
      retired_at timestamptz,
      UNIQUE (legal_document_id, version_label),
      CHECK (
        (state = 'DRAFT' AND activated_by IS NULL AND activated_at IS NULL AND retired_by IS NULL AND retired_at IS NULL) OR
        (state = 'ACTIVE' AND activated_by IS NOT NULL AND activated_at IS NOT NULL AND retired_by IS NULL AND retired_at IS NULL) OR
        (state = 'RETIRED' AND retired_by IS NOT NULL AND retired_at IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX legal_document_versions_one_active_idx
      ON legal_document_versions (legal_document_id) WHERE state = 'ACTIVE';

    CREATE TABLE legal_acceptances (
      legal_acceptance_id uuid PRIMARY KEY,
      legal_document_version_id uuid NOT NULL REFERENCES legal_document_versions(legal_document_version_id),
      account_id uuid NOT NULL REFERENCES user_accounts(account_id),
      accepted_at timestamptz NOT NULL,
      acceptance_source text NOT NULL CHECK (acceptance_source = 'REGISTRATION'),
      registration_set_fingerprint text NOT NULL,
      evidence_context jsonb NOT NULL,
      correlation_id uuid NOT NULL,
      UNIQUE (account_id, legal_document_version_id)
    );

    CREATE TABLE branches (
      branch_id uuid PRIMARY KEY,
      name text NOT NULL CHECK (length(trim(name)) > 0),
      internal_address text NOT NULL CHECK (length(trim(internal_address)) > 0),
      state text NOT NULL CHECK (state = 'ACTIVE'),
      timezone text NOT NULL CHECK (length(trim(timezone)) > 0),
      created_by uuid NOT NULL REFERENCES user_accounts(account_id),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );

    CREATE UNIQUE INDEX branches_one_active_idx ON branches ((state)) WHERE state = 'ACTIVE';

    CREATE FUNCTION sergod_prevent_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '55000';
    END;
    $$;

    CREATE TRIGGER system_bootstrap_records_immutable
      BEFORE UPDATE OR DELETE ON system_bootstrap_records
      FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
    CREATE TRIGGER account_state_history_immutable
      BEFORE UPDATE OR DELETE ON account_state_history
      FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
    CREATE TRIGGER role_history_immutable
      BEFORE UPDATE OR DELETE ON role_history
      FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
    CREATE TRIGGER legal_acceptances_immutable
      BEFORE UPDATE OR DELETE ON legal_acceptances
      FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();

    CREATE FUNCTION sergod_protect_legal_document() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.key_normalized <> OLD.key_normalized THEN
        RAISE EXCEPTION 'legal document key is immutable' USING ERRCODE = '55000';
      END IF;
      IF OLD.state IN ('ACTIVE', 'RETIRED') AND (
        NEW.public_title <> OLD.public_title OR
        NEW.purpose IS DISTINCT FROM OLD.purpose OR
        NEW.required_for_registration <> OLD.required_for_registration
      ) THEN
        RAISE EXCEPTION 'active or retired legal document fields are immutable' USING ERRCODE = '55000';
      END IF;
      IF OLD.state = 'RETIRED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'retired legal document is immutable' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER legal_documents_protected
      BEFORE UPDATE ON legal_documents
      FOR EACH ROW EXECUTE FUNCTION sergod_protect_legal_document();

    CREATE FUNCTION sergod_protect_legal_version() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.state IN ('ACTIVE', 'RETIRED') AND (
        NEW.legal_document_id <> OLD.legal_document_id OR
        NEW.version_label <> OLD.version_label OR
        NEW.title <> OLD.title OR
        NEW.content_location <> OLD.content_location OR
        NEW.created_by <> OLD.created_by OR
        NEW.created_at <> OLD.created_at
      ) THEN
        RAISE EXCEPTION 'active or retired legal version content is immutable' USING ERRCODE = '55000';
      END IF;
      IF OLD.state = 'RETIRED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'retired legal version is immutable' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' AND EXISTS (
        SELECT 1 FROM legal_acceptances
         WHERE legal_document_version_id = OLD.legal_document_version_id
      ) THEN
        RAISE EXCEPTION 'accepted legal version is immutable' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER legal_document_versions_protected
      BEFORE UPDATE OR DELETE ON legal_document_versions
      FOR EACH ROW EXECUTE FUNCTION sergod_protect_legal_version();

    CREATE FUNCTION sergod_validate_active_legal_document() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      document_id uuid;
      document_state text;
      active_count integer;
    BEGIN
      document_id := CASE WHEN TG_TABLE_NAME = 'legal_documents'
        THEN COALESCE(NEW.legal_document_id, OLD.legal_document_id)
        ELSE COALESCE(NEW.legal_document_id, OLD.legal_document_id)
      END;
      SELECT state INTO document_state FROM legal_documents WHERE legal_document_id = document_id;
      IF document_state = 'ACTIVE' THEN
        SELECT count(*) INTO active_count FROM legal_document_versions
         WHERE legal_document_id = document_id AND state = 'ACTIVE';
        IF active_count <> 1 THEN
          RAISE EXCEPTION 'active legal document requires exactly one active version'
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NULL;
    END;
    $$;

    CREATE CONSTRAINT TRIGGER legal_documents_active_version_guard
      AFTER INSERT OR UPDATE ON legal_documents
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION sergod_validate_active_legal_document();
    CREATE CONSTRAINT TRIGGER legal_versions_active_document_guard
      AFTER INSERT OR UPDATE OR DELETE ON legal_document_versions
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION sergod_validate_active_legal_document();

    ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE system_bootstrap_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE account_state_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE role_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE editorial_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE application_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE account_contact_changes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE external_identity_reconciliations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
    ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
