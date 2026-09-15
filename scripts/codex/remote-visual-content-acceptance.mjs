import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const stateUrl = new URL('.runtime/codex/remote-visual-content-state.json', root);
const mode = process.argv[2];
const environmentPath = process.argv[3] ?? '.runtime/codex/sergod-production.env';

if (!['--cleanup', '--cleanup-orphans', '--prepare', '--verify'].includes(mode))
  throw new Error('Use --prepare, --verify, --cleanup or --cleanup-orphans.');

const env = parseEnvironment(readFileSync(new URL(environmentPath, root), 'utf8'));
const api = new URL(env.API_PUBLIC_URL);
if (api.protocol !== 'https:' || api.hostname !== 'sergod-store-api-v4.onrender.com')
  throw new Error('Visual content acceptance is restricted to the official Sergod API.');

const imagePaths = [
  'design/approved/home-launcher/tournaments.webp',
  'design/approved/home-launcher/tournaments.webp',
  'design/approved/home-launcher/loyalty.webp',
  'design/approved/home-launcher/quests.webp',
  'design/approved/home-launcher/news.webp',
  'design/approved/home-launcher/community.webp',
  'design/approved/home-launcher/comics.webp',
  'design/approved/home-launcher/comics.webp',
];

async function request(path, { body, headers = {}, method = 'GET', token } = {}) {
  const response = await fetch(new URL(path, api), {
    ...(body === undefined ? {} : { body }),
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `${method} ${path} :: HTTP ${response.status} :: ${payload?.error?.code ?? 'UNKNOWN'}`,
    );
  return payload;
}

async function jsonRequest(path, { body, idempotencyKey, method = 'GET', token } = {}) {
  return request(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    method,
    token,
  });
}

async function login() {
  const session = await jsonRequest('/api/v1/identity/sessions', {
    body: { email: env.SERGOD_ADMIN_EMAIL, password: env.SERGOD_ADMIN_PASSWORD },
    method: 'POST',
  });
  if (typeof session.accessToken !== 'string') throw new Error('Admin login returned no token.');
  return session.accessToken;
}

function persist(state) {
  writeFileSync(stateUrl, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function fixtures(runId) {
  const suffix = runId.toLowerCase();
  const seriesSlug = `muestra-cronicas-${suffix}`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const item = (type, slug, title, excerpt, metadata = {}) => ({
    body: `${excerpt} Este contenido temporal permite comprobar el diseño, las imágenes y la persistencia sin representar una publicación comercial definitiva.`,
    excerpt,
    metadata: {
      acceptanceRunId: runId,
      document: {
        blocks: [
          {
            id: crypto.randomUUID(),
            text: `${excerpt} Esta muestra será archivada al terminar la revisión.`,
            type: 'TEXT',
          },
        ],
        version: 1,
      },
      ...metadata,
    },
    slug: `${slug}-${suffix}`,
    title: `[Muestra temporal] ${title}`,
    type,
  });
  return [
    item(
      'TOURNAMENT',
      'encuentro-sergod',
      'Encuentro Sergod',
      'Ejemplo de un próximo torneo con fecha, portada y detalle.',
      { event: { startsAt: tomorrow, status: 'UPCOMING' } },
    ),
    item(
      'TOURNAMENT',
      'resultados-sergod',
      'Resultados del torneo',
      'Ejemplo de un torneo realizado con espacio para resultados, podio y fotografías.',
      { event: { startsAt: yesterday, status: 'COMPLETED' } },
    ),
    item(
      'HALL_OF_FAME',
      'hall-of-fame-sergod',
      'Hall of Fame',
      'Ejemplo visual para los reconocimientos publicados por Sergod Store.',
    ),
    item(
      'QUEST',
      'quest-comunidad',
      'Desafío de la comunidad',
      'Ejemplo editorial de una Quest informativa preparada por Sergod Store.',
      { event: { startsAt: tomorrow, status: 'UPCOMING' } },
    ),
    item(
      'NEWS',
      'novedades-sergod',
      'Novedades en Sergod Store',
      'Ejemplo de una noticia con categoría, portada, texto e imágenes.',
      { category: 'Comunidad' },
    ),
    item(
      'COMMUNITY',
      'tarde-comunidad',
      'Tarde de comunidad',
      'Ejemplo de una actividad para reunir a la comunidad local.',
    ),
    item(
      'COMIC_SERIES',
      seriesSlug,
      'Crónicas Sergod',
      'Ejemplo de una serie con portada, descripción y capítulos.',
    ),
    item(
      'COMIC_CHAPTER',
      'primera-partida',
      'La primera partida',
      'Ejemplo de un capítulo ordenado con imágenes dentro del lector.',
      { comic: { chapterNumber: 1, seriesSlug } },
    ),
  ];
}

async function prepare() {
  try {
    readFileSync(stateUrl, 'utf8');
    throw new Error('A visual content acceptance state already exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const token = await login();
  const runId = `ACCEPT-VISUAL-${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}`;
  const state = { entries: [], runId };
  persist(state);
  try {
    for (const [index, body] of fixtures(runId).entries()) {
      const created = await jsonRequest('/api/v1/admin/content', {
        body,
        idempotencyKey: `${runId}:create:${body.type}:${index}`,
        method: 'POST',
        token,
      });
      const entry = {
        editorialEntryId: created.item.editorialEntryId,
        slug: body.slug,
        type: body.type,
      };
      state.entries.push(entry);
      persist(state);

      const form = new FormData();
      form.set(
        'file',
        new Blob([readFileSync(new URL(imagePaths[index], root))], { type: 'image/webp' }),
        `muestra-${index + 1}.webp`,
      );
      form.set('altText', `Imagen de muestra temporal para ${body.title}`);
      form.set('placement', index % 2 === 0 ? 'LEFT' : 'RIGHT');
      form.set('width', index % 3 === 0 ? 'LARGE' : 'MEDIUM');
      await request(`/api/v1/admin/content/${entry.editorialEntryId}/resources`, {
        body: form,
        headers: { 'idempotency-key': `${runId}:image:${index}` },
        method: 'POST',
        token,
      });
      await jsonRequest(`/api/v1/admin/content/${entry.editorialEntryId}/publish`, {
        method: 'POST',
        token,
      });
      entry.published = true;
      persist(state);
    }
    await verifyState(state);
    console.log('REMOTE_VISUAL_CONTENT_PREPARE=PASS');
    console.log(`ACCEPTANCE_RUN_ID=${runId}`);
    console.log(`PUBLISHED_ENTRIES=${state.entries.length}`);
  } catch (error) {
    const failures = await cleanupState(state, token);
    if (failures.length > 0)
      throw new Error(`${error.message} :: CLEANUP_FAILED :: ${failures.join(' | ')}`, {
        cause: error,
      });
    unlinkSync(stateUrl);
    throw error;
  }
}

async function verifyState(state) {
  for (const entry of state.entries) {
    const detail = await jsonRequest(`/api/v1/content/${entry.slug}`);
    if (
      detail.item.editorialEntryId !== entry.editorialEntryId ||
      detail.item.status !== 'PUBLISHED' ||
      detail.item.metadata?.acceptanceRunId !== state.runId
    )
      throw new Error(`Public persistence verification failed for ${entry.slug}.`);
    const blocks = detail.item.metadata?.document?.blocks ?? [];
    if (!blocks.some((block) => block.type === 'IMAGE'))
      throw new Error(`The published image is missing from ${entry.slug}.`);
  }
}

async function cleanupState(state, token) {
  const failures = [];
  for (const entry of [...state.entries].reverse()) {
    if (entry.archived === true) continue;
    try {
      await jsonRequest(`/api/v1/admin/content/${entry.editorialEntryId}/archive`, {
        method: 'POST',
        token,
      });
      entry.published = false;
      entry.archived = true;
      persist(state);
    } catch (error) {
      failures.push(error.message);
    }
  }
  return failures;
}

async function cleanupOrphans() {
  const token = await login();
  let cursor;
  let archived = 0;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (cursor !== undefined) query.set('cursor', cursor);
    const page = await jsonRequest(`/api/v1/admin/content?${query}`, { token });
    for (const entry of page.items ?? []) {
      if (
        entry.status !== 'ARCHIVED' &&
        String(entry.metadata?.acceptanceRunId ?? '').startsWith('ACCEPT-VISUAL-')
      ) {
        await jsonRequest(`/api/v1/admin/content/${entry.editorialEntryId}/archive`, {
          method: 'POST',
          token,
        });
        archived += 1;
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined && cursor !== null);
  console.log('REMOTE_VISUAL_CONTENT_ORPHAN_CLEANUP=PASS');
  console.log(`ARCHIVED_ORPHANS=${archived}`);
}

async function verify() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  await verifyState(state);
  console.log('REMOTE_VISUAL_CONTENT_VERIFY=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`PUBLISHED_ENTRIES=${state.entries.length}`);
}

async function cleanup() {
  const state = JSON.parse(readFileSync(stateUrl, 'utf8'));
  const token = await login();
  const failures = await cleanupState(state, token);
  if (failures.length > 0) throw new Error(`CLEANUP_FAILED :: ${failures.join(' | ')}`);
  for (const entry of state.entries) {
    try {
      await jsonRequest(`/api/v1/content/${entry.slug}`);
      throw new Error(`Archived entry remains public: ${entry.slug}.`);
    } catch (error) {
      if (!error.message.includes('HTTP 404')) throw error;
    }
  }
  unlinkSync(stateUrl);
  console.log('REMOTE_VISUAL_CONTENT_CLEANUP=PASS');
  console.log(`ACCEPTANCE_RUN_ID=${state.runId}`);
  console.log(`ARCHIVED_ENTRIES=${state.entries.length}`);
}

function parseEnvironment(source) {
  const result = {};
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    result[trimmed.slice(0, separator).trim()] = value;
  }
  return result;
}

await (mode === '--prepare'
  ? prepare()
  : mode === '--verify'
    ? verify()
    : mode === '--cleanup-orphans'
      ? cleanupOrphans()
      : cleanup());
