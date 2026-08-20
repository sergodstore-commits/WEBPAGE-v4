const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820043000_orders_checkout_advance.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TABLE checkout_order_idempotency_results;
DROP TABLE order_state_history;
DROP TABLE order_preorder_reservations;
DROP TABLE order_inventory_reservations;
DROP TABLE order_lines;
DROP TABLE orders;
DROP TABLE order_public_number_sequences;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
