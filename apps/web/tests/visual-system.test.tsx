import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = join(testsDirectory, '..');
const publicDirectory = join(webDirectory, 'public');
const assetDirectory = join(publicDirectory, 'assets', 'sergod');
const stylesDirectory = join(webDirectory, 'src', 'styles');
const baseStyles = readFileSync(join(stylesDirectory, 'base.css'), 'utf8');
const adminStyles = readFileSync(join(stylesDirectory, 'admin.css'), 'utf8');
const siteChrome = readFileSync(join(webDirectory, 'src', 'app', 'SiteChrome.tsx'), 'utf8');

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

describe('sistema visual', () => {
  it('conserva la base estructural neutral y separa las capas cliente y administrador', () => {
    expect(readdirSync(stylesDirectory).sort()).toEqual([
      'admin.css',
      'base.css',
      'client-theme.css',
    ]);
    expect(baseStyles).not.toMatch(/\/assets\/sergod\//u);
    expect(baseStyles).not.toMatch(/halftone|launcher|clip-path|drop-shadow|keyframes/iu);
    expect(adminStyles).toContain('.admin-theme');
    expect(adminStyles).not.toMatch(/\/assets\/sergod\//u);
  });

  it('publica únicamente las dos variantes inmutables del logo oficial', () => {
    const published = filesBelow(assetDirectory)
      .map((file) => `/${relative(publicDirectory, file).replaceAll('\\', '/')}`)
      .sort();

    expect(published).toEqual([
      '/assets/sergod/logo_sergod_store_oficial.png',
      '/assets/sergod/logo_sergod_store_oficial_transparente.webp',
    ]);
    expect(published.every((file) => existsSync(join(publicDirectory, file)))).toBe(true);
  });

  it('usa el derivado transparente del logo en la navegación pública', () => {
    expect(siteChrome).toContain('/assets/sergod/logo_sergod_store_oficial_transparente.webp');
    expect(siteChrome).not.toContain('src="/assets/sergod/logo_sergod_store_oficial.png"');
  });

  it('mantiene foco visible y una adaptación móvil mínima', () => {
    expect(baseStyles).toContain(':focus-visible');
    expect(baseStyles).toContain('@media (max-width: 900px)');
  });
});
