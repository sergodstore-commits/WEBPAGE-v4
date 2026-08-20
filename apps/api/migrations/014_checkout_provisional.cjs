const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260813055343_phase_9b_checkout_provisional.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TABLE checkout_provisional_idempotency_results;
DROP TRIGGER cart_groups_checkout_provisional_guard ON cart_groups;
DROP FUNCTION sergod_protect_cart_checkout_provisional();
DROP INDEX cart_groups_shipping_option_idx;
DROP INDEX cart_groups_pickup_branch_idx;
DROP INDEX cart_groups_selected_coupon_idx;
ALTER TABLE cart_groups
  DROP CONSTRAINT cart_groups_delivery_validation_ck,
  DROP CONSTRAINT cart_groups_delivery_intent_shape_ck,
  DROP COLUMN checkout_version,
  DROP COLUMN delivery_validation_error_codes,
  DROP COLUMN delivery_validation_status,
  DROP COLUMN delivery_last_validated_at,
  DROP COLUMN shipping_option_id,
  DROP COLUMN shipping_additional_details,
  DROP COLUMN shipping_commune,
  DROP COLUMN shipping_address,
  DROP COLUMN shipping_recipient_name,
  DROP COLUMN pickup_branch_id,
  DROP COLUMN delivery_mode,
  DROP COLUMN requested_points,
  DROP COLUMN selected_coupon_id;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
