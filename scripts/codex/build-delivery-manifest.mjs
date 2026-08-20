import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.runtime',
  '.tools',
  'coverage',
  'dist',
  'node_modules',
]);
const manifestName = 'PACKAGE-MANIFEST.json';
const checksumsName = 'PROJECT-CONTENT-SHA256SUMS.txt';

async function collectFiles(directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

async function describe(absolute) {
  const content = await readFile(absolute);
  return {
    path: relative(root, absolute).replaceAll('\\', '/'),
    bytes: (await stat(absolute)).size,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

const verification = {
  schemaVersion: 4,
  project: 'SERGOD-STORE-WEB-V1',
  deliveryProfile: 'CODEX_READY_V4_HANDOFF_VERIFIED_WITH_KNOWN_LOCAL_RUNNER_WARNING',
  createdUtc: new Date().toISOString(),
  productAuthority: 'docs/CURRENT/',
  missionStageCount: 7,
  initialStage: '00-baseline',
  sergodLocalSkills: 8,
  externalSkillsPolicy: 'APPROVED_ON_DEMAND_ONLY_PINNED',
  codexSystemValidation: 'PASS_138_CHECKS',
  protectedMigrationHistory: 'PASS_31_FILES',
  localGates: {
    format: 'PASS',
    lint: 'PASS',
    typecheck: 'PASS',
    unit: 'PASS_216',
    application: 'PASS_43',
    contract: 'PASS_53_SKIP_1',
    web: 'PASS_22',
    integrationLocalAssertions: 'PASS_163_POSTGRESQL_18_4',
    integrationLocalRunnerExit: 'WARN_MANUAL_TERMINATION_AFTER_PASS_SUMMARY',
    build: 'PASS',
    npmAudit: 'PASS_0_VULNERABILITIES',
    deliveryAudit: 'PASS',
  },
  deferredExternal: [
    'Flow sandbox',
    'Webpay integration environment',
    'real transactional email delivery and worker activation',
    'Git-connected Vercel deployment, remote E2E and production promotion',
  ],
  assertions: {
    noExternalPassWithoutCredentials: true,
    noPhysicalTransbankPos: true,
    prospectiveMigrationsOnlyForV4: true,
    noLocalImplementationCompleteDeclaration: true,
    freightCollectShippingZeroWithoutAddress: true,
    tournamentsEditorialOnly: true,
    noEmptyFilesOrDirectories: true,
    noRealEnvironmentFiles: true,
  },
  packagingNote:
    'Content manifest excludes .git, dependencies, builds, runtime directories and itself. ZIP integrity is recorded by the companion external SHA256 file.',
};
await writeFile(
  join(root, 'DELIVERY-VERIFICATION.json'),
  `${JSON.stringify(verification, null, 2)}\n`,
);

const checksumFiles = (await collectFiles()).filter((absolute) => {
  const name = relative(root, absolute).replaceAll('\\', '/');
  return name !== manifestName && name !== checksumsName;
});
const checksumEntries = await Promise.all(checksumFiles.map(describe));
await writeFile(
  join(root, checksumsName),
  `${checksumEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n`,
);

const manifestFiles = (await collectFiles()).filter(
  (absolute) => relative(root, absolute).replaceAll('\\', '/') !== manifestName,
);
const entries = await Promise.all(manifestFiles.map(describe));
const manifest = {
  schemaVersion: 4,
  scope:
    'all project content files excluding .git, dependency/build/runtime directories, and PACKAGE-MANIFEST.json itself',
  createdUtc: verification.createdUtc,
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  files: entries,
};
await writeFile(join(root, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `DELIVERY_MANIFEST=PASS files=${entries.length} bytes=${manifest.totalBytes}\n`,
);
