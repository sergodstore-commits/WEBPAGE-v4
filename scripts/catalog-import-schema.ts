import { z } from 'zod';

// Only hosts observed in the public catalogs authorized for these import batches.
const catalogHosts = new Set([
  'zeromulligan.cl',
  'www.zeromulligan.cl',
  'www.geekers.cl',
  'www.oneupstore.cl',
  'casamyl.cl',
  'elreinodelosduelos.cl',
  'www.yugioh-card.com',
  'goldsilver.cl',
  'www.empiregames.es',
  'cdnx.jumpseller.com',
  'dojiw2m9tvv09.cloudfront.net',
]);
const imageHosts = new Set([...catalogHosts, 'img.yugioh-card.com']);
const authorizedUrl = (hosts: Set<string>) =>
  z.url().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        hosts.has(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port
      );
    } catch {
      return false;
    }
  }, 'La URL debe usar HTTPS y un host del catálogo autorizado, sin credenciales ni puertos alternativos.');
export const catalogSourceUrl = authorizedUrl(catalogHosts).max(2000);
export const catalogImageUrl = authorizedUrl(imageHosts).max(1000);

export function resolveCatalogImageRedirect(current: string, location: string) {
  catalogImageUrl.parse(current);
  const source = new URL(current);
  const destination = new URL(location, current);
  catalogImageUrl.parse(destination.href);
  // Observed on the three official MAMS images: the website redirects its
  // uploads to this exact image host without changing the resource path/query.
  const officialImageRedirect =
    source.hostname === 'www.yugioh-card.com' &&
    destination.hostname === 'img.yugioh-card.com' &&
    source.pathname.startsWith('/eu/wp-content/uploads/') &&
    destination.pathname === source.pathname &&
    destination.search === source.search;
  if (destination.hostname !== source.hostname && !officialImageRedirect)
    throw new Error('La redirección de imagen intenta cambiar de host.');
  return destination.href;
}

const nullableDate = z.iso.datetime({ offset: true }).nullable().default(null);
export const catalogImportProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(1).max(12000),
    price: z.number().int().min(0).max(100000000),
    category: z.string().trim().min(1).max(80),
    brand: z.string().trim().min(1).max(100),
    catalog_group: z
      .string()
      .trim()
      .max(120)
      .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default(''),
    catalog_name: z.string().trim().max(180).default(''),
    options: z
      .record(
        z
          .string()
          .trim()
          .min(1)
          .max(60)
          .refine((key) => !['__proto__', 'prototype', 'constructor'].includes(key)),
        z.string().trim().min(1).max(160),
      )
      .refine((value) => Object.keys(value).length <= 6)
      .default({}),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    specifications: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          value: z.string().trim().min(1).max(1000),
        }),
      )
      .max(30)
      .default([]),
    source_url: catalogSourceUrl,
    images: z.array(catalogImageUrl).min(1).max(8),
    kind: z.enum(['store', 'preorder']).default('store'),
    publish: z.boolean().default(true),
    opens_at: nullableDate,
    closes_at: nullableDate,
    max_per_customer: z.number().int().min(1).max(10000).nullable().default(null),
    delivery_terms: z.string().trim().max(3000).default(''),
  })
  .superRefine((product, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (Boolean(product.catalog_group) !== Boolean(product.catalog_name))
      issue(
        'catalog_name',
        'El grupo y el nombre de catálogo deben completarse juntos o quedar vacíos.',
      );
    if (
      product.opens_at &&
      product.closes_at &&
      new Date(product.closes_at) <= new Date(product.opens_at)
    )
      issue('closes_at', 'El cierre debe ser posterior a la apertura.');
    if (!product.publish) return;
    if (product.price < 1) issue('price', 'Para publicar se necesita un precio mayor a cero.');
    if (product.kind !== 'preorder') return;
    if (!product.opens_at) issue('opens_at', 'Completa la apertura antes de publicar la preventa.');
    if (!product.closes_at) issue('closes_at', 'Completa el cierre antes de publicar la preventa.');
    if (!product.max_per_customer)
      issue('max_per_customer', 'Completa el máximo por cliente antes de publicar la preventa.');
    if (!product.delivery_terms)
      issue('delivery_terms', 'Completa las condiciones de entrega antes de publicar la preventa.');
    if (product.closes_at && new Date(product.closes_at) <= new Date())
      issue('closes_at', 'El cierre de la preventa debe ser una fecha futura.');
  });

export const catalogImportManifestSchema = z
  .object({
    version: z.literal(1),
    source: z.enum([
      'https://zeromulligan.cl/catalogo/',
      'sergod-selected-tcg-20260927',
      'sergod-ygo-languages-20261001',
    ]),
    collected_at: z.iso.datetime(),
    warnings: z
      .array(
        z.union([
          z.string(),
          z.object({ message: z.string() }).transform((value) => value.message),
        ]),
      )
      .default([]),
    products: z.array(catalogImportProductSchema).min(1).max(500),
  })
  .superRefine((manifest, ctx) => {
    if (new Set(manifest.products.map((product) => product.sku)).size !== manifest.products.length)
      ctx.addIssue({
        code: 'custom',
        path: ['products'],
        message: 'Hay SKU duplicados en el manifiesto.',
      });
  });
