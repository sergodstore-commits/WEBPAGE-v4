import { describe, expect, it } from 'vitest';

import { homeCarouselLinkSchema, homeCarouselUploadSchema } from './home-carousel.js';

describe('home carousel contract', () => {
  it('allows only the three admin-selected public destinations', () => {
    for (const path of ['/shop', '/preorders', '/community'])
      expect(homeCarouselLinkSchema.safeParse(path).success).toBe(true);
    for (const path of ['https://example.com', '//example.com', '/loyalty', '/comics', '/admin'])
      expect(homeCarouselLinkSchema.safeParse(path).success).toBe(false);
  });

  it('accepts an unpublished multipart banner', () => {
    expect(
      homeCarouselUploadSchema.parse({ active: 'false', altText: 'Portada', linkPath: '/shop' }),
    ).toMatchObject({ active: false, altText: 'Portada', linkPath: '/shop' });
  });
});
