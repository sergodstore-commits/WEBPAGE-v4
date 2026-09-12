const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260912090000_web_appearance_configuration.sql',
);
const upSql = readFileSync(path, 'utf8');
const previousSql = readFileSync(
  resolve(
    __dirname,
    '../../../supabase/migrations/20260812025910_system_configuration_administration.sql',
  ),
  'utf8',
);
const previousConstraintSql = previousSql.slice(0, previousSql.indexOf('CREATE FUNCTION'));
const downSql = `
ALTER TABLE system_configurations DROP CONSTRAINT system_configurations_registered_value_ck;
${previousConstraintSql}
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
