import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', '.runtime', '.tools', 'node_modules', 'dist', 'coverage']);
const emptyFiles = [];
const emptyDirectories = [];
const placeholders = [];
const realEnvs = [];
const placeholderAllowlist = new Set([
  'docs/CURRENT/07-PRUEBAS-Y-CALIDAD.md',
  'scripts/codex/audit-delivery.mjs',
]);

async function walk(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => !ignored.has(entry.name),
  );
  if (entries.length === 0 && directory !== root) emptyDirectories.push(relative(root, directory));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) {
      const info = await stat(path);
      const name = relative(root, path).replaceAll('\\', '/');
      if (info.size === 0) emptyFiles.push(name);
      if (/\/(?:\.env)(?:\.|$)/u.test(`/${name}`) && !name.endsWith('.env.example'))
        realEnvs.push(name);
      if (/\.(?:ts|tsx|js|mjs|cjs|md|txt|json|sql|css)$/u.test(name) && info.size < 2_000_000) {
        const text = await readFile(path, 'utf8');
        if (!placeholderAllowlist.has(name) && /\b(?:TODO|FIXME|PLACEHOLDER)\b/u.test(text))
          placeholders.push(name);
      }
    }
  }
}

await walk(root);
const skills = await readdir(join(root, '.agents', 'skills'), { withFileTypes: true });
const failures = {
  emptyDirectories,
  emptyFiles,
  realEnvs,
  skills:
    skills.filter((entry) => entry.isDirectory()).length === 8 ? [] : ['Expected 8 local skills'],
};
for (const [name, items] of Object.entries(failures)) {
  process.stdout.write(
    `${name.toUpperCase()}=${items.length === 0 ? 'PASS' : 'FAIL'} count=${items.length}\n`,
  );
  for (const item of items) process.stdout.write(`  ${item}\n`);
}
process.stdout.write(`PLACEHOLDER_REVIEW count=${placeholders.length}\n`);
for (const item of placeholders) process.stdout.write(`  ${item}\n`);
if (Object.values(failures).some((items) => items.length > 0)) process.exitCode = 1;
