const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260820080000_editorial_account_notifications.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TABLE notification_outbox;
DROP TABLE account_delivery_preferences;
DROP TABLE editorial_entries;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
