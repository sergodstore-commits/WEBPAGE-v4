import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = join(testsDirectory, '..');
const publicDirectory = join(webDirectory, 'public');
const assetDirectory = join(publicDirectory, 'assets', 'sergod', 'ui');
const stylesDirectory = join(webDirectory, 'src', 'styles');
const stylesheet = ['tokens.css', 'global.css', 'visual-system.css']
  .map((file) => readFileSync(join(stylesDirectory, file), 'utf8'))
  .join('\n');

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

describe('biblioteca visual pública', () => {
  it('publica cada recurso referenciado y no conserva derivados sin uso', () => {
    const references = [...new Set(stylesheet.match(/\/assets\/sergod\/ui\/[^')]+/g) ?? [])].sort();
    const published = filesBelow(assetDirectory)
      .map((file) => `/${relative(publicDirectory, file).replaceAll('\\', '/')}`)
      .sort();

    expect(references.length).toBeGreaterThan(0);
    expect(references.every((reference) => existsSync(join(publicDirectory, reference)))).toBe(
      true,
    );
    expect(published).toEqual(references);
  });

  it('usa solo derivados web sin etiquetas de texto horneado', () => {
    const published = filesBelow(assetDirectory).map((file) => file.toLowerCase());
    const textAssets =
      /navigation_|label_|comics_title|comic_reader|empty_state|error_state|success_state/;

    expect(published.every((file) => file.endsWith('.webp'))).toBe(true);
    expect(published.some((file) => textAssets.test(file))).toBe(false);
  });
});
