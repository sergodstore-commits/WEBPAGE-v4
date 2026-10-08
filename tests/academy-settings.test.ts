import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { duelHouse, academyHouses } from '../lib/duel-academy';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-academy-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });
test('Límites: persistencia real, lectura pública, rangos continuos y validación', async () => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { saveDuelThresholds, getDuelThresholds } = await import('../lib/server/duel-academy');
  const { publicRanking } = await import('../lib/server/rankings');
  try {
    await getDb();
    assert.deepEqual(await getDuelThresholds(), { ra_min: 150, obelisk_min: 251 });
    const limits = { ra_min: 80, obelisk_min: 200 };
    await saveDuelThresholds(limits);
    assert.deepEqual((await publicRanking('yugioh')).academy, limits);
    await closeDb();
    assert.deepEqual(await getDuelThresholds(), limits);
    assert.equal(duelHouse(79, limits), 'slifer');
    assert.equal(duelHouse(80, limits), 'ra');
    assert.equal(duelHouse(199, limits), 'ra');
    assert.equal(duelHouse(200, limits), 'obelisk');
    assert.equal(academyHouses(limits)[2].name, 'Obelisk');
    for (const invalid of [
      { ra_min: 0, obelisk_min: 200 },
      { ra_min: 200, obelisk_min: 200 },
      { ra_min: 201, obelisk_min: 200 },
      { ra_min: 1.5, obelisk_min: 200 },
    ])
      await assert.rejects(() => saveDuelThresholds(invalid));
    assert.deepEqual(await getDuelThresholds(), limits);
    assert.equal((await publicRanking('myl-first-era')).academy, undefined);
  } finally {
    await closeDb();
  }
});
