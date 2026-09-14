const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const upSql = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260913230000_web_appearance_constraint_repair.sql',
  ),
  'utf8',
);

exports.up = (pgm) => pgm.sql(upSql);
exports.down = () => {
  throw new Error('This prospective production constraint repair cannot be rolled back safely.');
};
exports.upSql = upSql;
