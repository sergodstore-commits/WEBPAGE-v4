import type { ReactNode } from 'react';

import {
  editorialResourceUrl,
  type EditorialDocumentValue,
  type EditorialImageBlock,
} from './editorial-document-model.js';

export function EditorialDocumentView({
  document,
  renderImage,
}: {
  readonly document: EditorialDocumentValue;
  readonly renderImage?: (block: EditorialImageBlock) => ReactNode;
}) {
  return (
    <div className="editorial-document">
      {document.blocks.map((block) =>
        block.type === 'TEXT' ? (
          <p className="editorial-text-block" key={block.id}>
            {block.text}
          </p>
        ) : (
          <figure
            className={`editorial-image-block placement-${block.placement.toLowerCase()} width-${block.width.toLowerCase()}`}
            key={block.id}
          >
            {renderImage?.(block) ?? (
              <img
                alt={block.altText}
                loading="lazy"
                src={editorialResourceUrl(block.resourceId)}
              />
            )}
          </figure>
        ),
      )}
    </div>
  );
}
