import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'codex-system/MIGRATION-BASELINE.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const failures = [];

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.protectedFiles)) {
  failures.push('invalid migration baseline manifest');
}

for (const entry of manifest.protectedFiles ?? []) {
  try {
    const bytes = await readFile(resolve(root, entry.path));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== entry.sha256) failures.push(`changed:${entry.path}`);
  } catch (error) {
    failures.push(`missing:${entry.path}:${error.code ?? error.message}`);
  }
}

if (failures.length > 0) {
  console.error(`MIGRATION_HISTORY=FAIL failures=${failures.length}`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`MIGRATION_HISTORY=PASS protected=${manifest.protectedFiles.length}`);
