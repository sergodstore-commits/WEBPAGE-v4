const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820120000_promotion_reservations_hardening.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TRIGGER promotion_usages_limits_enforced ON promotion_usages;
DROP FUNCTION sergod_enforce_promotion_usage_limits();
UPDATE promotion_usages
   SET status='RELEASED',released_at=COALESCE(released_at,occurred_at)
 WHERE status='RESERVED';
DROP TRIGGER promotion_usages_protected ON promotion_usages;
UPDATE promotion_usages SET committed_at=occurred_at WHERE committed_at IS NULL;
ALTER TABLE promotion_usages
  DROP CONSTRAINT promotion_usages_status_check,
  DROP CONSTRAINT promotion_usages_check,
  ALTER COLUMN committed_at SET NOT NULL;
ALTER TABLE promotion_usages
  ADD CONSTRAINT promotion_usages_status_check CHECK (status IN ('COMMITTED','RELEASED')),
  ADD CONSTRAINT promotion_usages_check
    CHECK ((status='COMMITTED' AND released_at IS NULL)
        OR (status='RELEASED' AND released_at IS NOT NULL));
CREATE OR REPLACE FUNCTION sergod_protect_promotion_usage()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'promotion usage cannot be deleted' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'released_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'released_at')
    THEN RAISE EXCEPTION 'promotion usage commercial facts are immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status<>'COMMITTED' OR NEW.status<>'RELEASED' OR NEW.released_at IS NULL
    THEN RAISE EXCEPTION 'promotion usage transition is invalid' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER promotion_usages_protected BEFORE UPDATE OR DELETE ON promotion_usages
FOR EACH ROW EXECUTE FUNCTION sergod_protect_promotion_usage();
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
