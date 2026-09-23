import { z } from 'zod';

export const homeCarouselMaximumSlides = 24;

// Carousel banners lead only to the three destinations offered in Admin.
export const homeCarouselLinkSchema = z
  .string()
  .trim()
  .max(240)
  .regex(/^\/(?:shop|preorders|community)$/u)
  .nullable();

export const homeCarouselFieldsSchema = z
  .object({
    altText: z.string().trim().min(1).max(240),
    linkPath: homeCarouselLinkSchema,
    active: z.boolean(),
  })
  .strict();

export const homeCarouselUploadSchema = homeCarouselFieldsSchema.extend({
  active: z.enum(['true', 'false']).transform((value) => value === 'true'),
  linkPath: z
    .string()
    .transform((value) => (value.trim() === '' ? null : value))
    .pipe(homeCarouselLinkSchema),
});

export const homeCarouselUpdateSchema = homeCarouselFieldsSchema.extend({
  expectedVersion: z.number().int().positive(),
});

export const homeCarouselOrderSchema = z
  .object({
    orderedSlideIds: z
      .array(z.uuid())
      .max(homeCarouselMaximumSlides)
      .refine((ids) => new Set(ids).size === ids.length),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export interface HomeCarouselSlide {
  readonly slideId: string;
  readonly altText: string;
  readonly linkPath: string | null;
  readonly active: boolean;
  readonly position: number;
  readonly version: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface HomeCarouselList {
  readonly items: readonly HomeCarouselSlide[];
  readonly revision: string;
}
