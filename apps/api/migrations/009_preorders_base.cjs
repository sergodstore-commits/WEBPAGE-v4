const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const supabaseMigrationPath = resolve(
  __dirname,
  '../../../supabase/migrations/20260810214318_phase_7_preorders_base.sql',
);
const upSql = readFileSync(supabaseMigrationPath, 'utf8');

const downSql = `
  DROP FUNCTION sergod_protect_preorder_evidence() CASCADE;
  DROP FUNCTION sergod_validate_preorder_reconciliation() CASCADE;
  DROP FUNCTION sergod_validate_preorder_pool() CASCADE;
  DROP TABLE preorder_stock_pool_ledger;
  DROP TABLE preorder_stock_lot_balances;
  DROP TABLE preorder_stock_transfers;
  DROP TABLE preorder_receipts;
  DROP TABLE preorder_stock_pools;
  DROP TABLE preorder_campaign_state_history;
  DROP TABLE preorder_campaigns;
`;

exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
