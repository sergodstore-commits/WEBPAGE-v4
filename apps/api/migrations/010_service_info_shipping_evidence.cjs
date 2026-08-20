const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');

const supabaseMigrationPath = resolve(
  __dirname,
  '../../../supabase/migrations/20260811025159_phase_3_service_info_shipping_evidence.sql',
);
const upSql = readFileSync(supabaseMigrationPath, 'utf8');
const downSql = `
  DROP FUNCTION sergod_validate_active_shipping_commune() CASCADE;
  DROP FUNCTION sergod_validate_active_shipping_option() CASCADE;
  DROP FUNCTION sergod_validate_public_service_info_revision() CASCADE;
  DROP TABLE shipping_configuration_history;
  DROP TABLE shipping_options;
  DROP TABLE shipping_zone_communes;
  DROP TABLE shipping_zones;
  DROP TABLE public_service_info, content_revisions;
`;

exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
