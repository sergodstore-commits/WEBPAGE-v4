const { readFileSync } = process.getBuiltinModule('node:fs');
const { resolve } = process.getBuiltinModule('node:path');
const upSql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260923010000_home_carousel.sql'),
  'utf8',
);
const downSql = `
DROP TABLE public.home_carousel_slides;
DROP FUNCTION public.sergod_home_carousel_resource_validate();
`;
exports.up = (pgm) => pgm.sql(upSql);
exports.down = (pgm) => pgm.sql(downSql);
exports.upSql = upSql;
exports.downSql = downSql;
