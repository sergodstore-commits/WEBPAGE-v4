import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fail = [];
const ok = [];
function exists(p) {
  return fs.existsSync(path.join(root, p));
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/u, ''));
}
function check(condition, message) {
  (condition ? ok : fail).push(message);
}

const required = [
  'AGENTS.md',
  'docs/CURRENT/INDEX.md',
  '.codex-mission/MISSION.md',
  '.codex-mission/STATE.json',
  'codex-system/EFFICIENCY-POLICY.md',
  'codex-system/AGENT-POLICY.md',
  'codex-system/CONTEXT-ROUTING.json',
  'codex-system/EXTERNAL-SKILLS.json',
  'codex-system/MIGRATION-BASELINE.json',
];
for (const p of required) check(exists(p), `required:${p}`);

const ownSkills = [
  'sergod-efficiency-governor',
  'sergod-context-router',
  'sergod-scope-guardian',
  'sergod-test-router',
  'sergod-db-guardian',
  'sergod-payment-guardian',
  'sergod-visual-guardian',
  'sergod-release-guardian',
];
const names = new Set();
for (const expected of ownSkills) {
  const rel = `.agents/skills/${expected}/SKILL.md`;
  check(exists(rel), `skill-exists:${expected}`);
  if (!exists(rel)) continue;
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  check(lines.length <= 500, `skill-compact:${expected}:${lines.length}`);
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  check(Boolean(match), `skill-frontmatter:${expected}`);
  if (!match) continue;
  const fm = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf(':');
        return i < 0 ? [line.trim(), ''] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  check(fm.name === expected, `skill-name:${expected}`);
  check(Boolean(fm.description && fm.description.length >= 40), `skill-description:${expected}`);
  check(!names.has(fm.name), `skill-unique:${expected}`);
  names.add(fm.name);
}

if (exists('.codex-mission/STATE.json') && exists('codex-system/CONTEXT-ROUTING.json')) {
  const state = readJson('.codex-mission/STATE.json');
  const routing = readJson('codex-system/CONTEXT-ROUTING.json');
  const queueIds = state.queue.map((x) => x.id);
  const completedIds = state.completedStages.map((x) => x.id);
  const routeIds = Object.keys(routing.stages);
  check(queueIds.length === 7, `mission-stage-count:${queueIds.length}`);
  check(JSON.stringify(queueIds) === JSON.stringify(routeIds), 'routing-stage-order-and-set');
  check(
    JSON.stringify(completedIds) === JSON.stringify(queueIds.slice(0, completedIds.length)),
    'mission-completed-is-prefix',
  );
  const remaining = state.queue.slice(completedIds.length);
  check(state.currentStageId === (remaining[0]?.id ?? null), 'mission-current-is-first-pending');
  check(state.currentStageFile === (remaining[0]?.file ?? null), 'mission-current-file');
  for (const [index, item] of state.queue.entries()) {
    const completed = index < completedIds.length;
    check(completed ? !exists(item.file) : exists(item.file), `stage-file:${item.id}`);
    if (!completed && exists(item.file)) {
      const first = fs.readFileSync(path.join(root, item.file), 'utf8').split(/\r?\n/)[0];
      check(first.includes(item.id), `stage-header:${item.id}`);
    }
    const r = routing.stages[item.id];
    if (!r) continue;
    for (const d of r.docs ?? []) check(exists(`docs/CURRENT/${d}`), `route-doc:${item.id}:${d}`);
    for (const p of r.searchRoots ?? []) check(exists(p), `route-root:${item.id}:${p}`);
  }
}

if (exists('codex-system/EXTERNAL-SKILLS.json')) {
  const ext = readJson('codex-system/EXTERNAL-SKILLS.json');
  check(
    /^https:\/\/github\.com\/composio-community\/awesome-codex-skills\.git$/.test(
      ext.source.repository,
    ),
    'external-source-exact',
  );
  check(/^[0-9a-f]{40}$/.test(ext.source.pinnedCommit), 'external-pinned-sha');
  const approved = ext.skills.filter((s) => s.status === 'APPROVED_ON_DEMAND');
  check(approved.length <= 2, `external-approved-small:${approved.length}`);
  for (const s of approved) {
    check(Boolean(s.path && s.expectedBlobs?.['SKILL.md']), `external-approved-pinned:${s.name}`);
    for (const stage of s.allowedStages ?? []) {
      const state = readJson('.codex-mission/STATE.json');
      check(
        state.queue.some((x) => x.id === stage),
        `external-stage-valid:${s.name}:${stage}`,
      );
    }
  }
}

if (fail.length) {
  console.error(`CODEX_SYSTEM=FAIL (${fail.length})`);
  for (const x of fail) console.error(`FAIL ${x}`);
  process.exit(1);
}
console.log(`CODEX_SYSTEM=PASS checks=${ok.length}`);
for (const x of ok) console.log(`PASS ${x}`);
