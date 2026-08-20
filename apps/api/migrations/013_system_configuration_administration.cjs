const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260812025910_system_configuration_administration.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TRIGGER system_configurations_lifecycle_guard ON system_configurations;
DROP FUNCTION sergod_protect_system_configuration();
ALTER TABLE system_configurations DROP CONSTRAINT system_configurations_registered_value_ck;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
