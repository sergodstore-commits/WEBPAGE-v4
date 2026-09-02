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
