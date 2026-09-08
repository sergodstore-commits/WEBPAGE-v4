import { MoneyClp } from '@sergod/foundation';
import { z } from 'zod';

export const publicationStatuses = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'] as const;
export type PublicationStatus = (typeof publicationStatuses)[number];

export const resourceStates = ['QUARANTINED', 'ACTIVE', 'REPLACED', 'REMOVED'] as const;
export type ResourceState = (typeof resourceStates)[number];
export const resourceClasses = [
  'CATALOG_IMAGE',
  'CONTENT_IMAGE',
  'COMIC_PAGE',
  'EVIDENCE_DOCUMENT',
] as const;
export type ResourceClass = (typeof resourceClasses)[number];

export const catalogImageMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type CatalogImageMimeType = (typeof catalogImageMimeTypes)[number];

export const catalogImageLimits = Object.freeze({
  maximumByteSize: 10 * 1024 * 1024,
  maximumDimensionPx: 8192,
  maximumPixels: 40_000_000,
  minimumDimensionPx: 320,
});

export type CatalogEntityType = 'CATEGORY' | 'COLLECTION' | 'PRODUCT' | 'TCG_GAME';
export type CatalogMediaSourceType = Exclude<CatalogEntityType, 'PRODUCT'>;
export type SaleType = 'PREORDER' | 'REGULAR';

const productInputSchema = z
  .object({
    categoryId: z.string().uuid(),
    collectionId: z.string().uuid().nullable(),
    condition: z.string().nullable().optional(),
    description: z.string().nullable(),
    edition: z.string().nullable().optional(),
    gameId: z.string().uuid(),
    language: z.string().nullable().optional(),
    name: z.string().trim().min(1),
    priceAmountClp: z.number().int().nonnegative().safe(),
    saleType: z.enum(['REGULAR', 'PREORDER']),
    sku: z.string().trim().min(1),
  })
  .strict();

const descriptorSchema = z
  .object({
    byteSize: z.number().int().positive().safe(),
    heightPx: z.number().int().positive().nullable(),
    megapixels: z.number().positive().max(40),
    mimeTypeReal: z.enum(catalogImageMimeTypes),
    originalFilenameSafe: z.string().min(1).max(255),
    secureStorageKey: z
      .string()
      .max(255)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/)*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
      ),
    sha256Hex: z.string().regex(/^[0-9a-f]{64}$/u),
    widthPx: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((descriptor, context) => {
    if (descriptor.widthPx === null || descriptor.heightPx === null) {
      context.addIssue({ code: 'custom', message: 'Catalog image dimensions are required.' });
      return;
    }
    const expected = (descriptor.widthPx * descriptor.heightPx) / 1_000_000;
    if (descriptor.megapixels !== expected) {
      context.addIssue({ code: 'custom', message: 'Catalog image megapixels are inconsistent.' });
    }
  });

export interface NormalizedProductInput {
  readonly categoryId: string;
  readonly collectionId: string | null;
  readonly condition: string | null;
  readonly description: string | null;
  readonly edition: string | null;
  readonly gameId: string;
  readonly language: string | null;
  readonly name: string;
  readonly priceAmountClp: number;
  readonly saleType: SaleType;
  readonly sku: string;
}

export type NormalizedProductPatch = Partial<NormalizedProductInput>;

export interface ValidatedResourceDescriptor {
  readonly byteSize: number;
  readonly heightPx: number | null;
  readonly megapixels: number;
  readonly mimeTypeReal: CatalogImageMimeType;
  readonly originalFilenameSafe: string;
  readonly secureStorageKey: string;
  readonly sha256Hex: string;
  readonly widthPx: number | null;
}

export class CatalogError extends Error {
  constructor(
    readonly code: string,
    readonly category: 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CatalogError';
  }
}

export function normalizeProductInput(value: unknown): NormalizedProductInput {
  const parsed = productInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new CatalogError(
      'CATALOG_PRODUCT_INVALID',
      'VALIDATION',
      'Product input does not match the current catalog contract.',
      { cause: parsed.error },
    );
  }
  return {
    ...parsed.data,
    condition: normalizeDescriptor(parsed.data.condition, 40, 'condition'),
    description: normalizeNullableText(parsed.data.description),
    edition: normalizeDescriptor(parsed.data.edition, 80, 'edition'),
    language: normalizeLanguage(parsed.data.language),
    priceAmountClp: MoneyClp.fromInteger(parsed.data.priceAmountClp).toInteger(),
  };
}

export function normalizeProductPatch(
  current: NormalizedProductInput,
  patch: NormalizedProductPatch,
): NormalizedProductInput {
  return normalizeProductInput({ ...current, ...patch });
}

export function normalizeCatalogRequiredText(value: string, code: string): string {
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!text) throw new CatalogError(code, 'VALIDATION', 'Required catalog text is missing.');
  return text;
}

export function normalizeCatalogNullableText(value: string | null | undefined): string | null {
  return normalizeNullableText(value);
}

export function parseValidatedResourceDescriptor(value: unknown): ValidatedResourceDescriptor {
  const parsed = descriptorSchema.safeParse(value);
  if (!parsed.success) {
    throw new CatalogError(
      'CATALOG_RESOURCE_DESCRIPTOR_INVALID',
      'VALIDATION',
      'Validated resource descriptor is invalid.',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export function assertPublicationTransition(
  current: PublicationStatus,
  next: PublicationStatus,
): void {
  if (current === next) return;
  const allowed =
    (current === 'DRAFT' && (next === 'PUBLISHED' || next === 'ARCHIVED')) ||
    (current === 'PUBLISHED' && (next === 'UNPUBLISHED' || next === 'ARCHIVED')) ||
    (current === 'UNPUBLISHED' && (next === 'PUBLISHED' || next === 'ARCHIVED'));
  if (!allowed) {
    throw new CatalogError(
      'CATALOG_STATE_TRANSITION_INVALID',
      'CONFLICT',
      `Cannot transition catalog entity from ${current} to ${next}.`,
    );
  }
}

export function assertResourceTransition(current: ResourceState, next: ResourceState): void {
  if (current === next) return;
  const allowed =
    (current === 'QUARANTINED' && next === 'ACTIVE') ||
    (current === 'ACTIVE' && (next === 'REPLACED' || next === 'REMOVED'));
  if (!allowed) {
    throw new CatalogError(
      'CATALOG_RESOURCE_STATE_TRANSITION_INVALID',
      'CONFLICT',
      `Cannot transition resource from ${current} to ${next}.`,
    );
  }
}

export function normalizeSafeFilename(value: string): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length === 0 ||
    normalized.length > 255 ||
    /[\\/]/u.test(normalized) ||
    normalized.includes('..') ||
    /^[a-z]:/iu.test(normalized) ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new CatalogError(
      'CATALOG_RESOURCE_FILENAME_INVALID',
      'VALIDATION',
      'Resource filename must be a safe label without path components.',
    );
  }
  return normalized;
}

function normalizeLanguage(value: string | null | undefined): string | null {
  const normalized = normalizeNullableText(value);
  if (normalized === null) return null;
  try {
    const canonical = Intl.getCanonicalLocales(normalized)[0];
    if (canonical === undefined || canonical.length < 2 || canonical.length > 35) throw new Error();
    return canonical;
  } catch {
    throw new CatalogError(
      'CATALOG_LANGUAGE_INVALID',
      'VALIDATION',
      'Product language must be a canonical BCP 47 tag between 2 and 35 characters.',
    );
  }
}

function normalizeDescriptor(
  value: string | null | undefined,
  maximumLength: number,
  field: 'condition' | 'edition',
): string | null {
  const text = normalizeNullableText(value)?.toLocaleUpperCase('und').normalize('NFC') ?? null;
  if (text === null) return null;
  if (text.length > maximumLength || !/^[-\p{L}\p{N} .'/()&+]+$/u.test(text)) {
    throw new CatalogError(
      `CATALOG_${field.toUpperCase()}_INVALID`,
      'VALIDATION',
      `Product ${field} does not match the current catalog format.`,
    );
  }
  return text;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized.length === 0 ? null : normalized;
}
