import { describe, expect, it } from 'vitest';

import { editorialWriteSchema } from './editorial.js';

const base = {
  body: 'Texto de la publicación.',
  excerpt: 'Resumen editorial.',
  slug: 'noticia-con-imagen',
  title: 'Noticia con imagen',
  type: 'NEWS' as const,
};

describe('editorial document contract', () => {
  it('accepts ordered text and image blocks with safe layout choices', () => {
    expect(
      editorialWriteSchema.parse({
        ...base,
        metadata: {
          document: {
            blocks: [
              {
                id: '0198a8be-6677-7000-8000-000000000001',
                text: 'Texto de la publicación.',
                type: 'TEXT',
              },
              {
                altText: 'Personas jugando en la tienda',
                id: '0198a8be-6677-7000-8000-000000000002',
                placement: 'RIGHT',
                resourceId: '0198a8be-6677-7000-8000-000000000003',
                type: 'IMAGE',
                width: 'MEDIUM',
              },
            ],
            version: 1,
          },
        },
      }).metadata,
    ).toMatchObject({ document: { version: 1 } });
  });

  it('accepts dated tournament metadata while keeping legacy entries valid', () => {
    expect(
      editorialWriteSchema.parse({
        ...base,
        metadata: { event: { startsAt: '2026-10-10T18:00:00-03:00', status: 'UPCOMING' } },
        type: 'TOURNAMENT',
      }).metadata.event,
    ).toEqual({ startsAt: '2026-10-10T18:00:00-03:00', status: 'UPCOMING' });
    expect(
      editorialWriteSchema.safeParse({ ...base, metadata: {}, type: 'TOURNAMENT' }).success,
    ).toBe(true);
  });

  it('rejects event metadata on unrelated editorial types', () => {
    expect(
      editorialWriteSchema.safeParse({
        ...base,
        metadata: { event: { startsAt: '2026-10-10T18:00:00-03:00', status: 'UPCOMING' } },
      }).success,
    ).toBe(false);
  });

  it('accepts news categories and rejects them on unrelated content', () => {
    expect(
      editorialWriteSchema.parse({ ...base, metadata: { category: 'Torneos' } }).metadata.category,
    ).toBe('Torneos');
    expect(
      editorialWriteSchema.safeParse({
        ...base,
        metadata: { category: 'Torneos' },
        type: 'COMMUNITY',
      }).success,
    ).toBe(false);
  });

  it('rejects unsafe markup-shaped blocks and unsupported positioning', () => {
    expect(() =>
      editorialWriteSchema.parse({
        ...base,
        metadata: {
          document: {
            blocks: [
              {
                altText: 'Imagen',
                html: '<script>alert(1)</script>',
                id: '0198a8be-6677-7000-8000-000000000002',
                placement: 'ABSOLUTE',
                resourceId: '0198a8be-6677-7000-8000-000000000003',
                type: 'IMAGE',
                width: 'MEDIUM',
              },
            ],
            version: 1,
          },
        },
      }),
    ).toThrow();
  });
});
