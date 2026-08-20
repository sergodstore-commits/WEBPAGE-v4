import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const runtime = path.join(root, '.runtime', 'codex');
fs.mkdirSync(runtime, { recursive: true });
function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}
const tracked = git(['ls-files', '-co', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
const unique = [...new Set(tracked)].filter(
  (p) =>
    !p.startsWith('.runtime/') && !p.includes('/node_modules/') && !p.startsWith('node_modules/'),
);
const changedRaw = git(['status', '--porcelain=v1']);
const changed = new Set(
  changedRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/g, '')),
);
function context(p) {
  if (p.startsWith('docs/CURRENT/')) return 'current';
  if (p.startsWith('.codex-mission/')) return 'mission';
  if (p.startsWith('.agents/skills/')) return 'skill';
  if (p.startsWith('design/')) return 'design';
  if (p.includes('/migrations/') || p.startsWith('supabase/')) return 'database';
  if (p.startsWith('packages/contracts/')) return 'contracts';
  if (p.startsWith('packages/foundation/')) return 'foundation';
  if (p.startsWith('apps/web/')) return 'web';
  const m = p.match(/^apps\/api\/src\/contexts\/([^/]+)/);
  if (m) return `api:${m[1]}`;
  if (p.startsWith('apps/api/')) return 'api';
  if (p.startsWith('scripts/')) return 'scripts';
  if (p.startsWith('tests/')) return 'tests';
  return 'repo';
}
const entries = [];
for (const rel of unique.sort()) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  const buf = fs.readFileSync(abs);
  entries.push({
    path: rel.replaceAll('\\', '/'),
    context: context(rel),
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    test: /\.(test|spec)\.[^.]+$/.test(rel) || rel.includes('/tests/'),
    changed: changed.has(rel),
  });
}
const statePath = path.join(root, '.codex-mission', 'STATE.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gitHead: git(['rev-parse', 'HEAD'], null),
  currentStageId: state.currentStageId ?? null,
  fileCount: entries.length,
  changedCount: entries.filter((x) => x.changed).length,
  entries,
};
fs.writeFileSync(path.join(runtime, 'repo-index.json'), JSON.stringify(out, null, 2) + '\n');
console.log(
  `CONTEXT_INDEX=PASS files=${out.fileCount} changed=${out.changedCount} path=.runtime/codex/repo-index.json`,
);
