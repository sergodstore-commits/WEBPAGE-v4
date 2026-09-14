-- Prospective repair for production databases where the appearance API was
-- deployed before WEB_APPEARANCE_LAYOUT was added to the registered-values
-- constraint. Re-applying the complete constraint is safe for fresh installs
-- and upgrades and does not alter existing configuration history.
ALTER TABLE public.system_configurations
  DROP CONSTRAINT IF EXISTS system_configurations_registered_value_ck;

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
    OR (configuration_key = 'WEB_APPEARANCE_LAYOUT'
      AND scope = 'GLOBAL' AND branch_id IS NULL AND value_type = 'TEXT'
      AND char_length(text_value) BETWEEN 1 AND 65536)
  );
