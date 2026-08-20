const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(
  __dirname,
  '../../../supabase/migrations/20260811183924_phase_9a_cart_foundation.sql',
);
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TRIGGER cart_lines_validated ON cart_lines;
DROP FUNCTION sergod_validate_cart_line();
DROP TRIGGER cart_groups_lifecycle_guard ON cart_groups;
DROP FUNCTION sergod_protect_cart_group_lifecycle();
DROP TRIGGER carts_lifecycle_guard ON carts;
DROP FUNCTION sergod_protect_cart_lifecycle();
DROP TABLE cart_lines;
DROP TABLE cart_groups;
DROP TABLE carts;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
