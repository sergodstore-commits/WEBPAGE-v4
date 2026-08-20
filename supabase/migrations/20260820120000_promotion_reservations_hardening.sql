ALTER TABLE public.promotion_usages
  DROP CONSTRAINT promotion_usages_status_check,
  DROP CONSTRAINT promotion_usages_check,
  ALTER COLUMN committed_at DROP NOT NULL;

ALTER TABLE public.promotion_usages
  ADD CONSTRAINT promotion_usages_status_check
    CHECK (status IN ('RESERVED','COMMITTED','RELEASED')),
  ADD CONSTRAINT promotion_usages_check
    CHECK ((status='RESERVED' AND committed_at IS NULL AND released_at IS NULL)
        OR (status='COMMITTED' AND committed_at IS NOT NULL AND released_at IS NULL)
        OR (status='RELEASED' AND released_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.sergod_protect_promotion_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'promotion usage cannot be deleted' USING ERRCODE='55000';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'committed_at' - 'released_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'committed_at' - 'released_at') THEN
    RAISE EXCEPTION 'promotion usage commercial facts are immutable' USING ERRCODE='55000';
  END IF;
  IF NOT (
    (OLD.status='RESERVED' AND NEW.status='COMMITTED'
      AND NEW.committed_at IS NOT NULL AND NEW.released_at IS NULL)
    OR (OLD.status='RESERVED' AND NEW.status='RELEASED'
      AND NEW.committed_at IS NULL AND NEW.released_at IS NOT NULL)
    OR (OLD.status='COMMITTED' AND NEW.status='RELEASED'
      AND NEW.committed_at=OLD.committed_at AND NEW.released_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'promotion usage transition is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.sergod_enforce_promotion_usage_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $$
DECLARE
  promotion_global_limit bigint;
  promotion_account_limit bigint;
  coupon_global_limit bigint;
  coupon_account_limit bigint;
BEGIN
  IF NEW.status NOT IN ('RESERVED','COMMITTED') THEN
    RETURN NEW;
  END IF;

  SELECT global_limit,per_account_limit
    INTO promotion_global_limit,promotion_account_limit
    FROM public.promotions
   WHERE promotion_id=NEW.promotion_id
   FOR UPDATE;

  IF promotion_global_limit IS NOT NULL AND
     (SELECT count(*) FROM public.promotion_usages
       WHERE promotion_id=NEW.promotion_id AND status IN ('RESERVED','COMMITTED'))
       >= promotion_global_limit THEN
    RAISE EXCEPTION 'promotion global usage limit reached' USING ERRCODE='23514';
  END IF;
  IF NEW.account_id IS NOT NULL AND promotion_account_limit IS NOT NULL AND
     (SELECT count(*) FROM public.promotion_usages
       WHERE promotion_id=NEW.promotion_id AND account_id=NEW.account_id
         AND status IN ('RESERVED','COMMITTED')) >= promotion_account_limit THEN
    RAISE EXCEPTION 'promotion account usage limit reached' USING ERRCODE='23514';
  END IF;

  IF NEW.coupon_id IS NOT NULL THEN
    SELECT global_limit,per_account_limit
      INTO coupon_global_limit,coupon_account_limit
      FROM public.coupons
     WHERE coupon_id=NEW.coupon_id AND promotion_id=NEW.promotion_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'coupon does not belong to promotion' USING ERRCODE='23514';
    END IF;
    IF coupon_global_limit IS NOT NULL AND
       (SELECT count(*) FROM public.promotion_usages
         WHERE coupon_id=NEW.coupon_id AND status IN ('RESERVED','COMMITTED'))
         >= coupon_global_limit THEN
      RAISE EXCEPTION 'coupon global usage limit reached' USING ERRCODE='23514';
    END IF;
    IF NEW.account_id IS NOT NULL AND coupon_account_limit IS NOT NULL AND
       (SELECT count(*) FROM public.promotion_usages
         WHERE coupon_id=NEW.coupon_id AND account_id=NEW.account_id
           AND status IN ('RESERVED','COMMITTED')) >= coupon_account_limit THEN
      RAISE EXCEPTION 'coupon account usage limit reached' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER promotion_usages_limits_enforced
BEFORE INSERT ON public.promotion_usages
FOR EACH ROW EXECUTE FUNCTION public.sergod_enforce_promotion_usage_limits();

REVOKE EXECUTE ON FUNCTION public.sergod_enforce_promotion_usage_limits() FROM PUBLIC;
