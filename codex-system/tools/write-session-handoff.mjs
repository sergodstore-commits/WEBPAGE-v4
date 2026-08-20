import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const runtime = path.join(root, '.runtime', 'codex');
fs.mkdirSync(runtime, { recursive: true });
const git = (args, fallback = '') => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
};
const state = JSON.parse(fs.readFileSync(path.join(root, '.codex-mission', 'STATE.json'), 'utf8'));
const lines = git(['status', '--porcelain=v1']).split(/\r?\n/).filter(Boolean);
const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  currentStageId: state.currentStageId,
  status: state.status,
  gitHead: git(['rev-parse', 'HEAD'], null),
  changedFiles: lines.map((x) => x.slice(3)),
  deferredExternal: state.deferredExternal ?? [],
};
fs.writeFileSync(path.join(runtime, 'session-handoff.json'), JSON.stringify(out, null, 2) + '\n');
console.log(
  `SESSION_HANDOFF=PASS changed=${out.changedFiles.length} path=.runtime/codex/session-handoff.json`,
);
