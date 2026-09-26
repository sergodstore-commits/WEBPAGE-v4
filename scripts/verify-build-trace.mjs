import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = process.env.NEXT_DIST_DIR || '.next';
const routes = ['server/app/[[...slug]]/page.js', 'server/app/api/[...path]/route.js'];
for (const route of routes) {
  const entry = path.resolve(dist, route);
  const trace = JSON.parse(fs.readFileSync(`${entry}.nft.json`, 'utf8'));
  const files = trace.files.map((file) => path.resolve(path.dirname(entry), file));
  const relative = files.map((file) => path.relative(root, file).replaceAll('\\', '/'));
  if (!relative.some((file) => file.endsWith('next/dist/server/node-environment.js')))
    throw new Error(`El artefacto ${route} no incluye el runtime de Next.js.`);
  for (let i = 0; i < files.length; i++) {
    if (!fs.existsSync(files[i]))
      throw new Error(`Dependencia ausente en ${route}: ${relative[i]}`);
    if (/^(?:s\/|\.data\/|\.env(?:\.|$))/.test(relative[i]))
      throw new Error(`El artefacto ${route} contiene archivos privados.`);
  }
  if (route.includes('/api/')) {
    for (const required of [
      'node_modules/pg/package.json',
      'node_modules/sharp/package.json',
      'db/migrations/001_initial.sql',
    ])
      if (!relative.includes(required))
        throw new Error(`Falta ${required} en el artefacto de API.`);
    for (const migration of fs
      .readdirSync(path.join(root, 'db/migrations'))
      .filter((file) => file.endsWith('.sql')))
      if (!relative.includes(`db/migrations/${migration}`))
        throw new Error(`Falta la migración ${migration} en el artefacto de API.`);
  }
  console.log(
    `Artefacto verificado: ${route}, ${files.length} dependencias, sin archivos privados.`,
  );
}
