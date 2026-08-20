exports.up = (pgm) => {
  pgm.sql(`
    UPDATE application_sessions
       SET invalidated_at = COALESCE(invalidated_at, CURRENT_TIMESTAMP),
           invalidation_reason = COALESCE(invalidation_reason, 'R5_EMAIL_ONLY_MIGRATION')
     WHERE login_channel = 'PHONE_PASSWORD' AND invalidated_at IS NULL;

    ALTER TABLE user_accounts
      ALTER COLUMN current_phone DROP NOT NULL,
      ALTER COLUMN normalized_phone DROP NOT NULL;
    ALTER TABLE user_accounts
      DROP CONSTRAINT IF EXISTS user_accounts_normalized_phone_key;
    DROP INDEX IF EXISTS account_contact_changes_pending_phone_idx;

    ALTER TABLE editorial_assignments
      DROP CONSTRAINT IF EXISTS editorial_assignments_area_check;
    UPDATE editorial_assignments SET area = 'TOURNAMENT_INFO' WHERE area = 'TOURNAMENTS';
    ALTER TABLE editorial_assignments
      ADD CONSTRAINT editorial_assignments_area_check
      CHECK (area IN ('NEWS', 'COMMUNITY', 'COMICS', 'EVENTS', 'TOURNAMENT_INFO', 'PUBLIC_SERVICE_INFO'));

    ALTER TABLE application_sessions
      DROP CONSTRAINT IF EXISTS application_sessions_login_channel_check;
    ALTER TABLE application_sessions
      ADD CONSTRAINT application_sessions_login_channel_check
      CHECK (
        login_channel = 'EMAIL_PASSWORD'
        OR (login_channel = 'PHONE_PASSWORD' AND invalidated_at IS NOT NULL)
      );

    CREATE OR REPLACE FUNCTION sergod_enforce_email_only_application_session()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
    BEGIN
      IF NEW.login_channel <> 'EMAIL_PASSWORD' THEN
        RAISE EXCEPTION 'new application sessions require EMAIL_PASSWORD' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS application_sessions_email_only ON application_sessions;
    CREATE TRIGGER application_sessions_email_only
      BEFORE INSERT OR UPDATE OF login_channel ON application_sessions
      FOR EACH ROW EXECUTE FUNCTION sergod_enforce_email_only_application_session();

    CREATE OR REPLACE FUNCTION sergod_reject_new_phone_contact_change()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
    BEGIN
      IF NEW.contact_type = 'PHONE' THEN
        RAISE EXCEPTION 'phone contact verification is retired' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS account_contact_changes_email_only ON account_contact_changes;
    CREATE TRIGGER account_contact_changes_email_only
      BEFORE INSERT ON account_contact_changes
      FOR EACH ROW EXECUTE FUNCTION sergod_reject_new_phone_contact_change();

    ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE application_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE account_contact_changes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE editorial_assignments ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
        END IF;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE user_accounts, application_sessions, account_contact_changes,
          editorial_assignments FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE user_accounts, application_sessions, account_contact_changes,
          editorial_assignments FROM authenticated;
      END IF;
    END;
    $$;
  `);
};

exports.down = () => {
  throw new Error(
    '003_email_only_authentication is intentionally non-reversible because R5 permits nullable and shared phone values.',
  );
};
