const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const upSql = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260923130000_account_tournament_identifiers.sql',
  ),
  'utf8',
);

exports.up = (pgm) => pgm.sql(upSql);
exports.down = () => {
  throw new Error('Tournament identifiers must be preserved; use a prospective migration.');
};
exports.upSql = upSql;
