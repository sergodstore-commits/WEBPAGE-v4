const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820070000_payments_fulfillment.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TABLE fulfillment_events;
DROP TABLE order_fulfillments;
DROP TABLE payment_attempt_events;
DROP TABLE payment_attempts;
ALTER TABLE orders DROP COLUMN paid_at;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
