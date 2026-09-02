export type EditorialImagePlacement = 'CENTER' | 'FULL' | 'LEFT' | 'RIGHT';
export type EditorialImageWidth = 'LARGE' | 'MEDIUM' | 'SMALL';

export interface EditorialTextBlock {
  readonly id: string;
  readonly text: string;
  readonly type: 'TEXT';
}

export interface EditorialImageBlock {
  readonly altText: string;
  readonly id: string;
  readonly placement: EditorialImagePlacement;
  readonly resourceId: string;
  readonly type: 'IMAGE';
  readonly width: EditorialImageWidth;
}

export type EditorialBlock = EditorialImageBlock | EditorialTextBlock;
export interface EditorialDocumentValue {
  readonly blocks: readonly EditorialBlock[];
  readonly version: 1;
}

export function documentFromMetadata(
  metadata: unknown,
  fallbackBody: string,
  fallbackId: string,
): EditorialDocumentValue {
  const document =
    metadata !== null && typeof metadata === 'object'
      ? (metadata as { document?: unknown }).document
      : undefined;
  const blocks =
    document !== null && typeof document === 'object'
      ? (document as { blocks?: unknown }).blocks
      : undefined;
  const parsed = Array.isArray(blocks) ? blocks.flatMap(parseBlock) : [];
  return {
    blocks:
      parsed.length > 0
        ? parsed
        : [{ id: fallbackId, text: fallbackBody || 'Contenido pendiente.', type: 'TEXT' }],
    version: 1,
  };
}

export function editorialResourceUrl(resourceId: string) {
  return `/api/v1/catalog/resources/${encodeURIComponent(resourceId)}/content`;
}

function parseBlock(value: unknown): EditorialBlock[] {
  if (value === null || typeof value !== 'object') return [];
  const block = value as Record<string, unknown>;
  if (block.type === 'TEXT' && typeof block.id === 'string' && typeof block.text === 'string')
    return [{ id: block.id, text: block.text, type: 'TEXT' }];
  if (
    block.type === 'IMAGE' &&
    typeof block.id === 'string' &&
    typeof block.resourceId === 'string' &&
    typeof block.altText === 'string' &&
    isPlacement(block.placement) &&
    isWidth(block.width)
  )
    return [
      {
        altText: block.altText,
        id: block.id,
        placement: block.placement,
        resourceId: block.resourceId,
        type: 'IMAGE',
        width: block.width,
      },
    ];
  return [];
}

function isPlacement(value: unknown): value is EditorialImagePlacement {
  return ['CENTER', 'FULL', 'LEFT', 'RIGHT'].includes(String(value));
}
function isWidth(value: unknown): value is EditorialImageWidth {
  return ['LARGE', 'MEDIUM', 'SMALL'].includes(String(value));
}
