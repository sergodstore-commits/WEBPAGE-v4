ALTER TABLE public.system_configurations
  ADD CONSTRAINT system_configurations_registered_value_ck CHECK (
    (configuration_key = 'PAYMENT_RESERVATION_DURATION_MINUTES'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 1)
    OR (configuration_key = 'ANONYMOUS_CART_INACTIVITY_MINUTES'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 1)
    OR (configuration_key = 'PICKUP_BRANCH_ID'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'REFERENCE')
    OR (configuration_key = 'DEFAULT_LOW_STOCK_THRESHOLD'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 0)
    OR (configuration_key = 'RESOURCE_PUBLIC_IMAGE_MAX_BYTES'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value BETWEEN 1 AND 10485760)
    OR (configuration_key = 'RESOURCE_EVIDENCE_MAX_BYTES'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value BETWEEN 1 AND 15728640)
    OR (configuration_key = 'RESOURCE_IMAGE_MAX_WIDTH_PX'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value BETWEEN 320 AND 8192)
    OR (configuration_key = 'RESOURCE_IMAGE_MAX_HEIGHT_PX'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value BETWEEN 320 AND 8192)
    OR (configuration_key = 'RESOURCE_IMAGE_MAX_MEGAPIXELS'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value BETWEEN 1 AND 40)
    OR (configuration_key = 'PICKUP_CODE_LENGTH'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 1)
    OR (configuration_key = 'PICKUP_MAX_FAILED_ATTEMPTS'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 1)
    OR (configuration_key = 'PICKUP_BLOCK_DURATION_MINUTES'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'INTEGER'
      AND integer_value >= 1)
  );

CREATE FUNCTION public.sergod_protect_system_configuration()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'system configuration history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.system_configuration_id IS DISTINCT FROM OLD.system_configuration_id
     OR NEW.configuration_key IS DISTINCT FROM OLD.configuration_key
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.value_type IS DISTINCT FROM OLD.value_type
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'system configuration identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.state IN ('ACTIVE', 'RETIRED') AND (
    NEW.integer_value IS DISTINCT FROM OLD.integer_value
    OR NEW.boolean_value IS DISTINCT FROM OLD.boolean_value
    OR NEW.text_value IS DISTINCT FROM OLD.text_value
    OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
  ) THEN
    RAISE EXCEPTION 'active or retired system configuration value is immutable'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.state = 'DRAFT' AND NEW.state NOT IN ('DRAFT', 'ACTIVE') THEN
    RAISE EXCEPTION 'draft system configuration transition is invalid' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'ACTIVE' AND NEW.state NOT IN ('ACTIVE', 'RETIRED') THEN
    RAISE EXCEPTION 'active system configuration transition is invalid' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'RETIRED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'retired system configuration is final' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER system_configurations_lifecycle_guard
  BEFORE UPDATE OR DELETE ON public.system_configurations
  FOR EACH ROW EXECUTE FUNCTION public.sergod_protect_system_configuration();

REVOKE EXECUTE ON FUNCTION public.sergod_protect_system_configuration() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.sergod_protect_system_configuration() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.sergod_protect_system_configuration() FROM authenticated;
  END IF;
END;
$$;
