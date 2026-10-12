import type { MylNewsBoard } from './web-news';

export type MylLibraryCard = {
  code: string;
  name: string;
  section: string;
  presentation?: string;
  role: 'pool' | 'fixed' | 'reserve';
  source: string;
  image?: string;
  thumbnail?: string;
};
export type MylPresentation = {
  id: string;
  name: string;
  fixed: string[];
  random: string[];
  reserve: string[];
  pool?: string;
};
export type MylLibraryDefinition = {
  code: string;
  name: string;
  board: MylNewsBoard;
  group: string;
  source: string;
  release_date: string;
  expected: number;
  presentations: MylPresentation[];
};
const booster = (pool: string): MylPresentation[] => [
  {
    id: 'sobre',
    name: 'Sobre',
    fixed: [],
    random: ['10 cartas: 2 Reales, 3 Cortesanos, 3 Vasallos y 2 del Set Clásico.'],
    reserve: [],
    pool,
  },
  {
    id: 'display',
    name: 'Display',
    fixed: ['24 sobres.'],
    random: ['El contenido de los sobres es al azar.'],
    reserve: [
      'Los beneficios Buy a Box dependen de la promoción y las condiciones de la ficha del producto.',
    ],
    pool,
  },
  {
    id: 'tres-displays',
    name: '3 displays',
    fixed: ['72 sobres en total.'],
    random: ['El contenido de los sobres es al azar.'],
    reserve: ['Revisa los Buy a Box y beneficios de la promoción en la ficha del pack.'],
    pool,
  },
];
export const mylLibraryDefinitions: MylLibraryDefinition[] = [
  {
    code: 'myl-lpb4',
    name: 'Leyendas Primer Bloque 4.0',
    board: 'myl-first-block',
    group: 'myl-leyendas-primer-bloque-4-0',
    source: 'https://blog.myl.cl/leyendas-primer-bloque-4-0/',
    release_date: '2026-06-12',
    expected: 400,
    presentations: booster('myl-lpb4'),
  },
  {
    code: 'myl-lpe4',
    name: 'Leyendas Primera Era 4.0',
    board: 'myl-first-era',
    group: 'myl-leyendas-primera-era-4-0',
    source: 'https://blog.myl.cl/leyendas-pe-4-0/',
    release_date: '2025-09-05',
    expected: 400,
    presentations: booster('myl-lpe4'),
  },
  {
    code: 'myl-ra',
    name: 'Relatos de Dominios de Ra',
    board: 'myl-first-block',
    group: 'myl-relatos-dominios-de-ra',
    source: 'https://blog.myl.cl/relatos-de-dominios-de-ra/',
    release_date: '2026-09-10',
    expected: 36,
    presentations: [
      {
        id: 'amanecer',
        name: 'Amanecer · Eterno',
        fixed: ['12 cartas del relato Amanecer.', '8 sobres de Leyendas Primer Bloque 4.0.'],
        random: ['El contenido de los sobres es al azar.'],
        reserve: [
          'Sobek y Wepwawet, más 1 carta al azar entre 5 opciones; solo durante la promoción de reserva.',
        ],
        pool: 'myl-lpb4',
      },
      {
        id: 'invasores',
        name: 'Invasores · Faraón',
        fixed: ['12 cartas del relato Invasores.', '8 sobres de Leyendas Primer Bloque 4.0.'],
        random: ['El contenido de los sobres es al azar.'],
        reserve: [
          'Tutankamón y Kush el Guerrero, más 1 carta al azar entre 5 opciones; solo durante la promoción de reserva.',
        ],
        pool: 'myl-lpb4',
      },
      {
        id: 'sabiduria',
        name: 'Sabiduría · Sacerdote',
        fixed: ['12 cartas del relato Sabiduría.', '8 sobres de Leyendas Primer Bloque 4.0.'],
        random: ['El contenido de los sobres es al azar.'],
        reserve: [
          'Kawit y Dagi, más 1 carta al azar entre 5 opciones; solo durante la promoción de reserva.',
        ],
        pool: 'myl-lpb4',
      },
    ],
  },
  {
    code: 'myl-ultratumba',
    name: 'Leyendas de Ultratumba',
    board: 'myl-first-era',
    group: 'myl-halloween-leyendas-ultratumba',
    source: 'https://blog.myl.cl/leyendas-de-ultratumba-primera-era/',
    release_date: '2026-10-16',
    expected: 48,
    presentations: [
      {
        id: 'tinieblas',
        name: 'Tinieblas',
        fixed: ['24 cartas nuevas.', '8 sobres de Leyendas Primera Era 4.0.'],
        random: ['El contenido de los sobres es al azar.'],
        reserve: ['Bayard con arte alternativo, durante el periodo de reserva.'],
        pool: 'myl-lpe4',
      },
      {
        id: 'abismo',
        name: 'Abismo',
        fixed: ['24 cartas nuevas.', '8 sobres de Leyendas Primera Era 4.0.'],
        random: ['El contenido de los sobres es al azar.'],
        reserve: ['Midgard con arte alternativo, durante el periodo de reserva.'],
        pool: 'myl-lpe4',
      },
    ],
  },
];
export type MylLibraryDocument = MylLibraryDefinition & {
  cards: MylLibraryCard[];
  updated: string;
};
export type MylLibraryPanel = {
  items: (MylLibraryDefinition & {
    total: number;
    ready: number;
    published: boolean;
    updated: string | null;
  })[];
  storage_bytes: number;
  storage_limit: number;
};
export const libraryFormats = {
  yugioh: 'Yu-Gi-Oh! TCG',
  'myl-first-era': 'MyL Primera Era',
  'myl-first-block': 'MyL Primer Bloque',
};
export const mylDefinition = (code: string) => mylLibraryDefinitions.find((d) => d.code === code);
export function mylPresentationForProduct(product: {
  catalog_group: string;
  sku: string;
  options: Record<string, string>;
}) {
  const definition = mylLibraryDefinitions.find((d) => d.group === product.catalog_group);
  if (!definition) return undefined;
  const text = `${product.sku} ${Object.values(product.options || {}).join(' ')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (definition.presentations.some((p) => p.id === 'tres-displays') && /3\s*displays?/i.test(text))
    return 'tres-displays';
  return definition.presentations.find((p) => new RegExp(`\\b${p.id}\\b`).test(text))?.id;
}
