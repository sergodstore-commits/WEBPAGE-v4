import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mylBanlistCardImage } from '../lib/myl-card-images';
import { mylBanlistSources } from '../lib/myl-banlist';
import { parseMylBanlist, applyMylNotice } from '../lib/server/myl-banlist';

test('MyL: las 180 imágenes verificadas conservan el formato y las 198 restricciones', async () => {
  const notice = await readFile('tests/fixtures/myl-banlist-october.html', 'utf8');
  for (const [board, file, total, illustrated] of [
    ['myl-first-era', 'myl-first-era.html', 112, 96],
    ['myl-first-block', 'myl-first-block.html', 86, 84],
  ] as const) {
    const base = parseMylBanlist(
      await readFile(`tests/fixtures/${file}`, 'utf8'),
      mylBanlistSources[board],
    );
    const current = applyMylNotice(
      base,
      notice,
      board,
      '2026-10-07',
      'https://blog.myl.cl/banlist-general-mitos-y-leyendas-07-10-26/',
    );
    assert.equal(current.cards.length, total);
    assert.equal(current.cards.filter((c) => mylBanlistCardImage(c, board)).length, illustrated);
    for (const card of current.cards) {
      const image = mylBanlistCardImage(card, board);
      if (image) assert.match(image, /^https:\/\/api\.myl\.cl\/static\/cards\/\d+\/\d+\.png$/);
    }
  }
});

test('MyL: admite acentos y correcciones verificadas sin mezclar los formatos', () => {
  const image = (name: string, board: 'myl-first-era' | 'myl-first-block') =>
    mylBanlistCardImage({ name, edition: '' }, board);
  assert.equal(
    image('Tótem de Águila', 'myl-first-era'),
    image('TOTEM DE AGUILA', 'myl-first-era'),
  );
  assert.ok(image('Groostlang', 'myl-first-era'));
  assert.equal(
    image('Niú Kánzhe Cáodí', 'myl-first-era'),
    undefined,
    'Una imagen no verificada no se sustituye por una carta de nombre parecido',
  );
  assert.equal(image('César Augusto', 'myl-first-era'), undefined);
  assert.equal(image('Mosquete Puritano', 'myl-first-block'), undefined);
  assert.equal(image('Carta desconocida', 'myl-first-era'), undefined);
});
