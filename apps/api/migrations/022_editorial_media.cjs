const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const path = resolve(__dirname, '../../../supabase/migrations/20260902010000_editorial_media.sql');
const upSql = readFileSync(path, 'utf8');
const downSql = `
DROP TRIGGER editorial_entry_media_immutable ON editorial_entry_media;
DROP TRIGGER editorial_entry_media_validate ON editorial_entry_media;
DROP FUNCTION sergod_editorial_media_immutable();
DROP FUNCTION sergod_editorial_media_validate();
DROP TABLE editorial_entry_media;
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
