const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260811025344_phase_8_pseudo_pos.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
ALTER TABLE preorder_stock_pool_ledger DROP CONSTRAINT preorder_stock_pool_ledger_check;
ALTER TABLE preorder_stock_pool_ledger DROP CONSTRAINT preorder_stock_pool_ledger_entry_type_check;
ALTER TABLE preorder_stock_pool_ledger DROP COLUMN preorder_allocation_id;
ALTER TABLE preorder_stock_pool_ledger ADD CONSTRAINT preorder_stock_pool_ledger_entry_type_check CHECK (entry_type IN ('RECEIPT_IN','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT'));
ALTER TABLE preorder_stock_pool_ledger ADD CONSTRAINT preorder_stock_pool_ledger_check CHECK ((entry_type='RECEIPT_IN' AND preorder_receipt_id IS NOT NULL AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NULL) OR (entry_type IN ('TRANSFER_IN','TRANSFER_OUT') AND preorder_receipt_id IS NULL AND preorder_stock_transfer_id IS NOT NULL AND inventory_movement_id IS NULL) OR (entry_type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT') AND preorder_receipt_id IS NULL AND preorder_stock_transfer_id IS NULL AND inventory_movement_id IS NOT NULL));
DROP TABLE preorder_allocations, stock_reservations; DROP TABLE preorder_commitments;
DROP TABLE loyalty_effect_progress; DROP TABLE promotion_usages; DROP TABLE pos_sale_settlements;
DROP TABLE pos_sale_manual_discounts; DROP TABLE pos_sale_state_history; DROP TABLE pos_sale_lines;
DROP TABLE pos_sales; DROP TABLE external_money_method_history; DROP TABLE external_money_methods;
DROP FUNCTION sergod_protect_pos_sale_child(); DROP FUNCTION sergod_protect_completed_pos_sale(); DROP FUNCTION sergod_protect_external_money_method();
DROP FUNCTION sergod_protect_promotion_usage(); DROP FUNCTION sergod_protect_loyalty_effect_progress();
DROP FUNCTION sergod_validate_pos_completion();
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
