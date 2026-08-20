const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820100000_order_confirmation_notifications.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TABLE order_loyalty_reservations;
DROP INDEX loyalty_movements_idempotency_idx;
DROP INDEX promotion_usages_idempotency_idx;
ALTER TABLE promotion_usages
  DROP CONSTRAINT promotion_usages_channel_source_check,
  DROP CONSTRAINT promotion_usages_channel_check,
  DROP CONSTRAINT promotion_usages_source_type_check;
ALTER TABLE promotion_usages
  ADD CONSTRAINT promotion_usages_channel_check CHECK (channel='POS'),
  ADD CONSTRAINT promotion_usages_source_type_check CHECK (source_type='POS_SALE'),
  ADD CONSTRAINT promotion_usages_source_id_fkey FOREIGN KEY (source_id) REFERENCES pos_sales(pos_sale_id);
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
