const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const upSql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260923120000_preorder_customer_limit.sql'),
  'utf8',
);

exports.up = (pgm) => pgm.sql(upSql);
exports.down = () => {
  throw new Error('Removing campaign purchase limits requires an explicit prospective migration.');
};
exports.upSql = upSql;
