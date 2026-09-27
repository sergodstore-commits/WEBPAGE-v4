import { loadEnvConfig } from '@next/env';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

loadEnvConfig(process.cwd());
const sourceImage = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' && ['zeromulligan.cl', 'www.zeromulligan.cl'].includes(url.hostname)
  );
}, 'La imagen debe pertenecer al catálogo público autorizado de Zero Mulligan.');
const manifestSchema = z.object({
  version: z.literal(1),
  source: z.literal('https://zeromulligan.cl/catalogo/'),
  collected_at: z.iso.datetime(),
  warnings: z
    .array(
      z.union([z.string(), z.object({ message: z.string() }).transform((value) => value.message)]),
    )
    .default([]),
  products: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(80),
        name: z.string().trim().min(2).max(180),
        description: z.string().min(1).max(12000),
        price: z.number().int().positive().max(100000000),
        category: z.string().trim().min(1).max(80),
        brand: z.literal('Zero Mulligan'),
        catalog_group: z
          .string()
          .max(120)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        catalog_name: z.string().trim().min(1).max(180),
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
          .refine((value) => Object.keys(value).length <= 6),
        tags: z.array(z.string().trim().min(1).max(80)).max(30),
        specifications: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(80),
              value: z.string().trim().min(1).max(1000),
            }),
          )
          .max(30),
        source_url: sourceImage.max(2000),
        images: z.array(sourceImage.max(1000)).min(1).max(8),
      }),
    )
    .min(1)
    .max(500),
});
type Journal = {
  origin: string;
  source: string;
  images: Record<string, string>;
  products: Record<
    string,
    { id?: string; version?: number; phase: 'creating' | 'created' | 'published' | 'preserved' }
  >;
};

async function main() {
  const args = process.argv.slice(2);
  const argument = (name: string, fallback = '') =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const manifestPath = argument('--manifest');
  if (!manifestPath) throw new Error('Usa --manifest ruta.json y, para guardar, --apply.');
  const manifest = manifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  if (new Set(manifest.products.map((p) => p.sku)).size !== manifest.products.length)
    throw new Error('Hay SKU duplicados en el manifiesto.');
  const apply = args.includes('--apply');
  const summary = {
    families: new Set(manifest.products.map((p) => p.catalog_group)).size,
    variants: manifest.products.length,
    images: new Set(manifest.products.flatMap((p) => p.images)).size,
    initialStock: 0,
  };
  console.log(
    JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary, warnings: manifest.warnings }),
  );
  if (!apply) return;
  const origin = new URL(process.env.APP_URL || '').origin;
  if (!origin.startsWith('https://') || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    throw new Error('Configura APP_URL HTTPS, ADMIN_EMAIL y ADMIN_PASSWORD en el entorno privado.');
  const journalPath = path.resolve(argument('--state', '.data/zeromulligan-import/journal.json'));
  await fs.mkdir(path.dirname(journalPath), { recursive: true });
  let journal: Journal = { origin, source: manifest.source, images: {}, products: {} };
  try {
    journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (journal.origin !== origin || journal.source !== manifest.source)
    throw new Error('El diario pertenece a otra tienda o fuente. Usa otro archivo --state.');
  const persist = async () => {
    await fs.writeFile(journalPath + '.tmp', JSON.stringify(journal, null, 2));
    await fs.rename(journalPath + '.tmp', journalPath);
  };
  let cookie = '';
  const api = async (route: string, method = 'GET', body?: unknown): Promise<any> => {
    const form = body instanceof FormData;
    let response: Response;
    try {
      response = await fetch(origin + '/api/' + route, {
        method,
        headers: {
          Origin: origin,
          Cookie: cookie,
          ...(!form ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? (form ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(55000),
        redirect: 'error',
      });
    } catch {
      throw new Error(
        `Conexión interrumpida en ${method} ${route}. Reanuda con el mismo diario; no se repite automáticamente una escritura incierta.`,
      );
    }
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie')!.split(';')[0];
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `${method} ${route}: HTTP ${response.status}. ${data.error || 'Solicitud rechazada.'}`,
      );
    return data;
  };
  const admin = await api('auth/login', 'POST', {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  if (admin.role !== 'admin') throw new Error('La cuenta no tiene permisos administrativos.');
  const download = async (initial: string) => {
    let target = initial;
    for (let redirect = 0; redirect < 4; redirect++) {
      sourceImage.parse(target);
      const response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirección de imagen sin destino.');
        target = new URL(location, target).toString();
        continue;
      }
      if (!response.ok)
        throw new Error(`Imagen de origen no disponible (HTTP ${response.status}): ${initial}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Imagen sin contenido.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 16 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('La imagen supera 16 MiB.');
        }
        chunks.push(part.value);
      }
      let bytes = Buffer.concat(chunks);
      const metadata = await sharp(bytes, { limitInputPixels: 30_000_000 }).metadata();
      if (!['webp', 'png', 'jpeg', 'avif'].includes(metadata.format || ''))
        throw new Error('Formato de imagen no permitido.');
      if (bytes.length > 4 * 1024 * 1024)
        bytes = await sharp(bytes, { limitInputPixels: 30_000_000 })
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      return bytes;
    }
    throw new Error('Demasiadas redirecciones en imagen.');
  };
  const upload = async (source: string) => {
    if (journal.images[source]) return journal.images[source];
    const bytes = await download(source);
    const form = new FormData();
    form.set('file', new File([new Uint8Array(bytes)], 'catalogo-zero-mulligan.webp'));
    const result = await api('admin/uploads', 'POST', form);
    if (typeof result.url !== 'string') throw new Error('La carga no devolvió URL.');
    journal.images[source] = result.url;
    await persist();
    return result.url;
  };
  let current: any[] = await api('admin/products');
  let created = 0,
    published = 0,
    preserved = 0;
  for (const [index, product] of manifest.products.entries()) {
    const previous = journal.products[product.sku];
    let existing = current.find((p) => p.sku === product.sku);
    if (previous?.id && !existing) {
      console.log(
        JSON.stringify({ sku: product.sku, result: 'preserved-admin-change-or-removal' }),
      );
      preserved++;
      continue;
    }
    if (
      existing &&
      previous &&
      (previous.phase === 'published' ||
        previous.phase === 'preserved' ||
        (previous.id && previous.id !== existing.id) ||
        existing.status !== 'draft' ||
        existing.version !== previous.version)
    ) {
      preserved++;
      console.log(
        JSON.stringify({ sku: product.sku, result: 'preserved-existing', stock: existing.stock }),
      );
      continue;
    }
    if (
      existing &&
      (existing.catalog_group !== product.catalog_group ||
        existing.source_url !== product.source_url)
    )
      throw new Error(
        `El SKU ${product.sku} ya existe y no coincide con la fuente. No se sobrescribe.`,
      );
    if (existing && !previous) {
      preserved++;
      console.log(
        JSON.stringify({ sku: product.sku, result: 'preserved-existing', stock: existing.stock }),
      );
      continue;
    }
    if (!existing) {
      const images: string[] = [];
      for (const source of product.images) images.push(await upload(source));
      // Migration 002 gives every newly inserted product version 1. Save that
      // expectation before the request so an edited draft is never published on resume.
      journal.products[product.sku] = { phase: 'creating', version: 1 };
      await persist();
      existing = await api('admin/products', 'POST', {
        ...product,
        images,
        stock: 0,
        discount_percent: 0,
        kind: 'store',
        status: 'draft',
        opens_at: null,
        closes_at: null,
        max_per_customer: null,
        delivery_terms: '',
      });
      current.push(existing);
      created++;
    }
    const expectedVersion = journal.products[product.sku].version;
    if (existing.version !== expectedVersion) {
      journal.products[product.sku] = {
        id: existing.id,
        phase: 'preserved',
        version: expectedVersion,
      };
      await persist();
      preserved++;
      console.log(JSON.stringify({ sku: product.sku, result: 'preserved-concurrent-edit' }));
      continue;
    }
    journal.products[product.sku] = { id: existing.id, version: expectedVersion, phase: 'created' };
    await persist();
    if (existing.status === 'draft') {
      existing = await api(`admin/products/${existing.id}/publish`, 'POST', {
        expected_version: expectedVersion,
      });
      published++;
    }
    if (existing.status !== 'published') throw new Error(`No se publicó ${product.sku}.`);
    for (let read = 0; read < 2; read++) {
      const publicProduct = await api('products/' + encodeURIComponent(existing.slug));
      if (
        publicProduct.id !== existing.id ||
        publicProduct.catalog_group !== product.catalog_group ||
        !publicProduct.images.length
      )
        throw new Error(`La lectura pública no coincide para ${product.sku}.`);
    }
    journal.products[product.sku] = { id: existing.id, phase: 'published' };
    await persist();
    console.log(
      JSON.stringify({
        progress: `${index + 1}/${manifest.products.length}`,
        sku: product.sku,
        result: 'published',
        stock: existing.stock,
      }),
    );
  }
  // Read the saved catalog again, independently of responses to writes.
  current = await api('admin/products');
  const imported = current.filter((p) =>
    manifest.products.some((m) => m.sku === p.sku && m.source_url === p.source_url),
  );
  const report = {
    completedAt: new Date().toISOString(),
    origin,
    source: manifest.source,
    ...summary,
    created,
    published,
    preserved,
    storedVariants: imported.length,
    publishedVariants: imported.filter((p) => p.status === 'published').length,
    stockUnits: imported.reduce((n, p) => n + p.stock, 0),
    allImagesStored: imported.every((p) =>
      p.images.every((url: string) => url.includes('/storage/v1/object/public/')),
    ),
    warnings: manifest.warnings,
  };
  await fs.writeFile(
    path.join(path.dirname(journalPath), 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'No se pudo importar el catálogo.');
  process.exitCode = 1;
});
