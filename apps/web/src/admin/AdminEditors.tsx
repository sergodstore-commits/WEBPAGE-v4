import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EditorialDocumentView } from '../editorial/EditorialDocument.js';
import {
  documentFromMetadata,
  type EditorialBlock,
  type EditorialDocumentValue,
  type EditorialImagePlacement,
  type EditorialImageWidth,
} from '../editorial/editorial-document-model.js';
import {
  type AuthorizedResponse,
  authorizedBlob,
  authorizedRequest,
  authorizedResponse,
} from '../identity/api.js';
import { StoreField } from '../service-coverage/StoreField.js';
import type { StoreSummary } from '../service-coverage/store.js';
import { itemIdentifier, itemReference } from './presentation.js';

type Item = Record<string, unknown>;
export type AdminAction = (
  path: string,
  body: unknown,
  method?: string,
  reload?: string,
) => Promise<unknown>;

export function CatalogEditors({
  categories,
  collections,
  games,
  onAction,
  products,
}: {
  readonly categories: readonly Item[];
  readonly collections: readonly Item[];
  readonly games: readonly Item[];
  readonly onAction: AdminAction;
  readonly products: readonly Item[];
}) {
  const patchParent = (event: FormEvent<HTMLFormElement>, segment: string, reload: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/catalog/${segment}/${String(form.get('entityId'))}`,
      { description: nullable(form.get('description')), name: String(form.get('name')) },
      'PATCH',
      reload,
    );
  };
  const patchCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/catalog/collections/${String(form.get('entityId'))}`,
      {
        description: nullable(form.get('description')),
        gameId: String(form.get('gameId')),
        name: String(form.get('name')),
      },
      'PATCH',
      'collections',
    );
  };
  const patchProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/catalog/products/${String(form.get('entityId'))}`,
      {
        categoryId: String(form.get('categoryId')),
        collectionId: nullable(form.get('collectionId')),
        condition: nullable(form.get('condition')),
        description: nullable(form.get('description')),
        edition: nullable(form.get('edition')),
        gameId: String(form.get('gameId')),
        language: nullable(form.get('language')),
        name: String(form.get('name')),
        priceAmountClp: Number(form.get('price')),
        saleType: String(form.get('saleType')),
        sku: String(form.get('sku')),
      },
      'PATCH',
      'catalog',
    );
  };
  return (
    <section className="cut-panel admin-module" id="catalog-editors">
      <h2>Editar producto</h2>
      <p>Selecciona un producto, revisa sus datos y guarda únicamente los cambios necesarios.</p>
      <div className="catalog-product-form">
        <form onSubmit={(event) => void patchProduct(event)}>
          <h3>Datos del producto</h3>
          <ItemSelect
            items={products}
            label="Producto"
            name="entityId"
            onSelect={(item, form) =>
              fillForm(form, item, {
                categoryId: 'categoryId',
                collectionId: 'collectionId',
                condition: 'condition',
                description: 'description',
                edition: 'edition',
                gameId: 'gameId',
                language: 'language',
                name: 'name',
                priceAmountClp: 'price',
                saleType: 'saleType',
                sku: 'sku',
              })
            }
          />
          <ItemSelect items={games} label="Juego" name="gameId" />
          <ItemSelect items={categories} label="Categoría" name="categoryId" />
          <ItemSelect allowEmpty items={collections} label="Colección" name="collectionId" />
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <label>
            Precio CLP
            <input min="0" name="price" required type="number" />
          </label>
          <label>
            Tipo
            <select name="saleType">
              <option value="REGULAR">Regular</option>
              <option value="PREORDER">Preventa</option>
            </select>
          </label>
          <label>
            Idioma (código internacional)
            <input
              name="language"
              pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*"
              placeholder="Ej.: es-CL"
              title="Usa un código de idioma, por ejemplo es-CL."
            />
          </label>
          <label>
            Edición
            <input name="edition" />
          </label>
          <label>
            Condición
            <input name="condition" />
          </label>
          <label>
            Descripción
            <textarea name="description" />
          </label>
          <button>Guardar producto</button>
        </form>
      </div>
      <details className="catalog-reference-tools">
        <summary>Editar juegos, categorías y colecciones</summary>
        <p>Estas clasificaciones afectan a varios productos. Modifícalas con cuidado.</p>
        <div className="admin-form-grid">
          <ParentEditor
            items={games}
            label="Juego TCG"
            onSubmit={(event) => patchParent(event, 'tcg-games', 'games')}
          />
          <ParentEditor
            items={categories}
            label="Categoría"
            onSubmit={(event) => patchParent(event, 'categories', 'categories')}
          />
          <form onSubmit={(event) => void patchCollection(event)}>
            <h3>Colección</h3>
            <ItemSelect
              items={collections}
              label="Colección"
              name="entityId"
              onSelect={(item, form) =>
                fillForm(form, item, { description: 'description', gameId: 'gameId', name: 'name' })
              }
            />
            <ItemSelect items={games} label="Juego" name="gameId" />
            <TextFields />
            <button>Guardar colección</button>
          </form>
        </div>
      </details>
    </section>
  );
}

function ParentEditor({
  items,
  label,
  onSubmit,
}: {
  readonly items: readonly Item[];
  readonly label: string;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <h3>{label}</h3>
      <ItemSelect
        items={items}
        label={label}
        name="entityId"
        onSelect={(item, form) =>
          fillForm(form, item, { description: 'description', name: 'name' })
        }
      />
      <TextFields />
      <button>Guardar {label.toLocaleLowerCase('es-CL')}</button>
    </form>
  );
}
function TextFields() {
  return (
    <>
      <label>
        Nombre
        <input name="name" required />
      </label>
      <label>
        Descripción
        <textarea name="description" />
      </label>
    </>
  );
}

const owners = [
  { label: 'Juego TCG', segment: 'tcg-games' },
  { label: 'Categoría', segment: 'categories' },
  { label: 'Colección', segment: 'collections' },
  { label: 'Producto', segment: 'products' },
] as const;

export function CatalogResourceManager({
  categories,
  collections,
  games,
  initialProductId = '',
  onContinue,
  products,
}: {
  readonly categories: readonly Item[];
  readonly collections: readonly Item[];
  readonly games: readonly Item[];
  readonly initialProductId?: string;
  readonly onContinue?: () => void;
  readonly products: readonly Item[];
}) {
  const [owner, setOwner] = useState<(typeof owners)[number]['segment']>('products');
  const [entityId, setEntityId] = useState(initialProductId);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [etag, setEtag] = useState('');
  const [retireReasons, setRetireReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('Selecciona un producto para administrar su galería.');
  const [pendingUploads, setPendingUploads] = useState<readonly PendingCatalogUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const pendingUploadsRef = useRef<readonly PendingCatalogUpload[]>([]);
  const loadGeneration = useRef(0);
  const entities = useMemo(
    () =>
      owner === 'products'
        ? products
        : owner === 'tcg-games'
          ? games
          : owner === 'categories'
            ? categories
            : collections,
    [categories, collections, games, owner, products],
  );
  const base = `/api/v1/admin/catalog/${owner}/${entityId}/resources`;
  const selectedEntity = entities.find((item) => itemIdentifier(item) === entityId);
  const selectedLabel = selectedEntity ? itemReference(selectedEntity) : '';
  const load = useCallback(
    async (targetEntityId: string, targetOwner: (typeof owners)[number]['segment']) => {
      if (!targetEntityId) return setMessage('Selecciona una entidad.');
      const generation = ++loadGeneration.current;
      try {
        const loaded: Item[] = [];
        const seenCursors = new Set<string>();
        let cursor: string | null = null;
        let representationEtag = '';
        do {
          const targetBase = `/api/v1/admin/catalog/${targetOwner}/${targetEntityId}/resources`;
          const pagePath: string = `${targetBase}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
          const response: AuthorizedResponse<{ items: Item[]; nextCursor: string | null }> =
            await authorizedResponse(pagePath);
          const pageEtag = response.headers.get('etag') ?? '';
          if (representationEtag && pageEtag !== representationEtag)
            throw new Error('Las imágenes cambiaron durante la carga. Vuelve a intentarlo.');
          representationEtag = pageEtag;
          loaded.push(...response.body.items);
          cursor = response.body.nextCursor;
          if (cursor && seenCursors.has(cursor))
            throw new Error('La paginación de imágenes no avanzó.');
          if (cursor) seenCursors.add(cursor);
        } while (cursor);
        if (generation !== loadGeneration.current) return;
        setItems(loaded);
        setEtag(representationEtag);
        setMessage(
          loaded.length ? 'Imágenes cargadas.' : 'Esta entidad todavía no tiene imágenes.',
        );
      } catch (error) {
        if (generation === loadGeneration.current) setMessage(messageOf(error));
      }
    },
    [],
  );
  useEffect(() => {
    if (!initialProductId) return;
    const timeout = window.setTimeout(() => void load(initialProductId, 'products'), 0);
    return () => window.clearTimeout(timeout);
  }, [initialProductId, load]);
  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);
  useEffect(() => () => revokeUploadPreviews(pendingUploadsRef.current), []);
  const selectFiles = (files: FileList | readonly File[] | null) => {
    if (uploading) return;
    const selected = files === null ? [] : Array.from(files);
    const invalid = selected.find(
      (file) =>
        !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) ||
        file.size === 0 ||
        file.size > 10 * 1024 * 1024,
    );
    if (invalid) {
      setMessage(`«${invalid.name}» no se puede subir. Usa JPG, PNG, WebP o AVIF de hasta 10 MB.`);
      return;
    }
    revokeUploadPreviews(pendingUploads);
    const firstPosition = nextCatalogImagePosition(items);
    setPendingUploads(
      selected.map((file, index) => ({
        altText: '',
        file,
        idempotencyKey: crypto.randomUUID(),
        position: firstPosition + index,
        previewUrl: URL.createObjectURL(file),
      })),
    );
  };
  const removePendingUpload = (idempotencyKey: string) => {
    setPendingUploads((current) => {
      const removed = current.find((item) => item.idempotencyKey === idempotencyKey);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const firstPosition = nextCatalogImagePosition(items);
      return current
        .filter((item) => item.idempotencyKey !== idempotencyKey)
        .map((item, index) => ({ ...item, position: firstPosition + index }));
    });
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (uploading) return;
    if (!entityId) return setMessage('Selecciona una entidad.');
    if (pendingUploads.length === 0) return setMessage('Selecciona al menos una imagen.');
    if (pendingUploads.some((item) => item.altText.trim() === ''))
      return setMessage('Describe cada imagen antes de subirla.');
    let uploaded = 0;
    setUploading(true);
    try {
      setMessage(
        `Subiendo ${pendingUploads.length} ${pendingUploads.length === 1 ? 'imagen' : 'imágenes'}…`,
      );
      for (const item of pendingUploads) {
        const data = new FormData();
        data.set('file', item.file);
        data.set('altText', item.altText.trim());
        data.set('position', String(item.position));
        await authorizedRequest(base, {
          body: data,
          headers: { 'idempotency-key': item.idempotencyKey },
          method: 'POST',
        });
        uploaded += 1;
      }
      form.reset();
      revokeUploadPreviews(pendingUploads);
      setPendingUploads([]);
      await load(entityId, owner);
      setMessage(
        `${uploaded} ${uploaded === 1 ? 'imagen subida' : 'imágenes subidas'} correctamente.`,
      );
    } catch (error) {
      const completed = pendingUploads.slice(0, uploaded);
      const remaining = pendingUploads.slice(uploaded);
      const feedback =
        uploaded === 0
          ? messageOf(error)
          : `${uploaded} ${uploaded === 1 ? 'imagen se guardó' : 'imágenes se guardaron'}; faltan ${remaining.length}. ${messageOf(error)}`;
      revokeUploadPreviews(completed);
      setPendingUploads(remaining);
      await load(entityId, owner);
      setMessage(feedback);
    } finally {
      setUploading(false);
    }
  };
  const json = async (path: string, body: unknown, method: string, headers: HeadersInit = {}) => {
    try {
      await authorizedRequest(path, {
        body: JSON.stringify(body),
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        method,
      });
      setMessage('Operación de imagen guardada.');
      await load(entityId, owner);
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const replace = async (event: FormEvent<HTMLFormElement>, resourceId: string) => {
    event.preventDefault();
    try {
      await authorizedRequest(`${base}/${resourceId}/replacements`, {
        body: new FormData(event.currentTarget),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      });
      setMessage('Imagen reemplazada correctamente.');
      await load(entityId, owner);
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const move = (resourceId: string, delta: number) => {
    const ids = items.map((item) => String(item.resourceId));
    const index = ids.indexOf(resourceId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const currentId = ids[index];
    const targetId = ids[target];
    if (currentId === undefined || targetId === undefined) return;
    ids[index] = targetId;
    ids[target] = currentId;
    void json(`${base}/order`, { orderedResourceIds: ids }, 'PATCH', { 'if-match': etag });
  };
  return (
    <section className="cut-panel admin-module" id="catalog-resources">
      <h2>Galería del producto</h2>
      <p>Sube las fotos, define la portada y ordénalas como aparecerán en la tienda.</p>
      <p>
        Usa fotos nítidas, preferiblemente cuadradas o verticales y con el producto completo dentro
        del encuadre. Formatos JPG, PNG, WebP o AVIF; máximo técnico 10 MB por archivo. El servidor
        valida las dimensiones y puede aplicar un límite configurado menor.
      </p>
      <p className="status" role="status">
        {message}
      </p>
      <div className="catalog-gallery-setup">
        <div className="catalog-gallery-selector">
          <label>
            Tipo de contenido
            <select
              disabled={uploading}
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value as typeof owner);
                loadGeneration.current += 1;
                setEntityId('');
                setItems([]);
                setEtag('');
                setRetireReasons({});
                revokeUploadPreviews(pendingUploads);
                setPendingUploads([]);
                setMessage('Selecciona una entidad para administrar su galería.');
              }}
            >
              <option value="products">Producto</option>
              <option value="tcg-games">Juego TCG</option>
              <option value="categories">Categoría</option>
              <option value="collections">Colección</option>
            </select>
          </label>
          <ItemSelect
            disabled={uploading}
            items={entities}
            label={owners.find((entry) => entry.segment === owner)?.label ?? 'Entidad'}
            name="resourceEntity"
            onChange={(value) => {
              setEntityId(value);
              loadGeneration.current += 1;
              setItems([]);
              setEtag('');
              setRetireReasons({});
              setMessage(value ? 'Cargando galería…' : 'Selecciona una entidad.');
              revokeUploadPreviews(pendingUploads);
              setPendingUploads([]);
              if (value) void load(value, owner);
            }}
            value={entityId}
          />
          {selectedEntity && (
            <div className="catalog-selected-entity">
              <span>Galería seleccionada</span>
              <strong>{selectedLabel}</strong>
              <small>
                {items.length} {items.length === 1 ? 'imagen' : 'imágenes'}
              </small>
            </div>
          )}
        </div>
        <form
          aria-busy={uploading}
          className="catalog-upload-card"
          encType="multipart/form-data"
          onSubmit={(event) => void upload(event)}
        >
          <h3>Añadir imágenes</h3>
          <label
            className="catalog-upload-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!uploading) selectFiles(event.dataTransfer.files);
            }}
          >
            Seleccionar imágenes
            <input
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              name="file"
              onChange={(event) => selectFiles(event.target.files)}
              disabled={uploading}
              type="file"
            />
            <span>Arrastra aquí una o varias fotos, o selecciónalas desde tu equipo.</span>
          </label>
          {pendingUploads.length === 0 ? (
            <div className="catalog-upload-placeholder">Las vistas previas aparecerán aquí.</div>
          ) : (
            <div className="catalog-pending-upload-grid">
              {pendingUploads.map((item, index) => (
                <article key={item.idempotencyKey}>
                  <img alt="" className="catalog-upload-preview" src={item.previewUrl} />
                  <strong>{item.file.name}</strong>
                  <label>
                    Descripción de la imagen {index + 1}
                    <input
                      onChange={(event) =>
                        setPendingUploads((current) =>
                          current.map((candidate) =>
                            candidate.idempotencyKey === item.idempotencyKey
                              ? { ...candidate, altText: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="Ej.: Frente de la caja"
                      required
                      value={item.altText}
                    />
                  </label>
                  <button
                    aria-label={`Quitar ${item.file.name} de esta carga`}
                    className="link"
                    disabled={uploading}
                    onClick={() => removePendingUpload(item.idempotencyKey)}
                    type="button"
                  >
                    Quitar de esta carga
                  </button>
                </article>
              ))}
            </div>
          )}
          <small>
            Se añadirá al final de la galería y el servidor reducirá su peso cuando sea posible sin
            deformarla.
          </small>
          <button disabled={!entityId || pendingUploads.length === 0 || uploading}>
            {uploading ? 'Procesando imágenes…' : 'Añadir a la galería'}
          </button>
        </form>
      </div>
      {entityId && items.length > 0 && (
        <div className="catalog-resource-grid">
          {items.map((item, index) => {
            const id = String(item.resourceId);
            return (
              <article className="admin-resource" key={id}>
                <div className="catalog-resource-image">
                  <CatalogResourcePreview
                    alt={String(item.altText ?? '')}
                    entityId={entityId}
                    owner={owner}
                    resourceId={id}
                  />
                  {item.isPrimary === true && <span className="status-chip">Portada</span>}
                </div>
                <div className="catalog-resource-copy">
                  <strong>{String(item.originalFilenameSafe ?? id)}</strong>
                  <p>{String(item.altText ?? '')}</p>
                  <small>Posición {index + 1}</small>
                </div>
                <div className="admin-inline-actions">
                  <button
                    disabled={index === 0 || !etag}
                    onClick={() => move(id, -1)}
                    type="button"
                  >
                    Mover antes
                  </button>
                  <button
                    disabled={index === items.length - 1 || !etag}
                    onClick={() => move(id, 1)}
                    type="button"
                  >
                    Mover después
                  </button>
                  <button
                    disabled={item.isPrimary === true}
                    onClick={() => void json(`${base}/primary`, { resourceId: id }, 'PUT')}
                    type="button"
                  >
                    {item.isPrimary === true ? 'Es la portada' : 'Usar como portada'}
                  </button>
                </div>
                <details className="catalog-image-maintenance">
                  <summary>Reemplazar o quitar imagen</summary>
                  <form encType="multipart/form-data" onSubmit={(event) => void replace(event, id)}>
                    <label>
                      Nueva imagen
                      <input
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        name="file"
                        required
                        type="file"
                      />
                    </label>
                    <label>
                      Descripción de la imagen
                      <input defaultValue={String(item.altText ?? '')} name="altText" required />
                    </label>
                    <label>
                      Motivo del reemplazo
                      <input name="reason" required />
                    </label>
                    <button>Reemplazar imagen</button>
                  </form>
                  <div className="catalog-retire-image">
                    <label>
                      Motivo para quitarla
                      <input
                        name="retireReason"
                        onChange={(event) =>
                          setRetireReasons((current) => ({ ...current, [id]: event.target.value }))
                        }
                        value={retireReasons[id] ?? ''}
                      />
                    </label>
                    <button
                      className="danger"
                      onClick={() => {
                        const reason = retireReasons[id]?.trim();
                        if (!reason) return setMessage('Indica el motivo para quitar la imagen.');
                        void json(`${base}/${id}/retirements`, { reason }, 'POST');
                      }}
                      type="button"
                    >
                      Quitar de la galería
                    </button>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
      {entityId && owner === 'products' && onContinue && (
        <button onClick={onContinue} type="button">
          Continuar a publicación
        </button>
      )}
    </section>
  );
}

interface PendingCatalogUpload {
  readonly altText: string;
  readonly file: File;
  readonly idempotencyKey: string;
  readonly position: number;
  readonly previewUrl: string;
}

function revokeUploadPreviews(items: readonly PendingCatalogUpload[]): void {
  for (const item of items) URL.revokeObjectURL(item.previewUrl);
}

function nextCatalogImagePosition(items: readonly Item[]): number {
  return (
    items.reduce((maximum, item) => {
      const position = Number(item.position);
      return Number.isSafeInteger(position) && position > maximum ? position : maximum;
    }, 0) + 1
  );
}

function CatalogResourcePreview({
  alt,
  entityId,
  owner,
  resourceId,
}: {
  readonly alt: string;
  readonly entityId: string;
  readonly owner: (typeof owners)[number]['segment'];
  readonly resourceId: string;
}) {
  const [preview, setPreview] = useState<{ readonly failed: boolean; readonly source: string }>({
    failed: false,
    source: '',
  });
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void authorizedBlob(
      `/api/v1/admin/catalog/${owner}/${entityId}/resources/${resourceId}/content`,
    )
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ failed: false, source: objectUrl });
      })
      .catch(() => {
        if (active) setPreview({ failed: true, source: '' });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entityId, owner, resourceId]);
  if (preview.source) return <img alt={alt} src={preview.source} />;
  return <span>{preview.failed ? 'Imagen no disponible' : 'Cargando imagen…'}</span>;
}

export function RecordEditors({
  area,
  content,
  configurations,
  loyalty,
  onAction,
  preorders,
  products,
  promotions,
  store,
}: {
  readonly area: 'configuration' | 'content' | 'loyalty' | 'preorders' | 'promotions';
  readonly content: readonly Item[];
  readonly configurations: readonly Item[];
  readonly loyalty: readonly Item[];
  readonly onAction: AdminAction;
  readonly preorders: readonly Item[];
  readonly products: readonly Item[];
  readonly promotions: readonly Item[];
  readonly store: StoreSummary | null;
}) {
  if (area === 'content') return <EditorialVisualEditor content={content} onAction={onAction} />;
  const preorder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/preorders/campaigns/${String(form.get('id'))}`,
      {
        branchId: String(form.get('branchId')),
        capacity: Number(form.get('capacity')),
        maxPerCustomer: nullableNumber(form.get('maxPerCustomer')),
        closesAt: date(form.get('closesAt')),
        estimatedArrivalText: String(form.get('arrival')),
        fulfillmentGroupKey: nullable(form.get('groupKey')),
        opensAt: date(form.get('opensAt')),
        productId: String(form.get('productId')),
      },
      'PATCH',
      'preorders',
    );
  };
  const loyaltyEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/loyalty/configurations/${String(form.get('id'))}`,
      {
        earnClpPerPoint: Number(form.get('earn')),
        maximumRedeemBasisPoints: nullableNumber(form.get('maximum')),
        minimumRedeemPoints: Number(form.get('minimum')),
        redeemClpPerPoint: Number(form.get('redeem')),
      },
      'PATCH',
      'loyalty',
    );
  };
  const configEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('value'));
    return onAction(
      `/api/v1/admin/system-configurations/${String(form.get('id'))}`,
      { reason: String(form.get('reason')), value: /^-?\d+$/u.test(raw) ? Number(raw) : raw },
      'PATCH',
      'configurations',
    );
  };
  const promotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/promotions/${String(form.get('id'))}`,
      {
        activationMode: String(form.get('activationMode')),
        benefit: { basisPoints: Number(form.get('basisPoints')), type: 'PERCENTAGE_DISCOUNT' },
        branchId: nullable(form.get('branchId')),
        channel: String(form.get('channel')),
        endsAt: date(form.get('endsAt')),
        globalLimit: nullableNumber(form.get('globalLimit')),
        minimumEligibleAmountClp: nullableNumber(form.get('minimumAmount')),
        minimumEligibleQuantity: nullableNumber(form.get('minimumQuantity')),
        name: String(form.get('name')),
        perAccountLimit: nullableNumber(form.get('perAccountLimit')),
        priority: Number(form.get('priority')),
        schedules: [],
        scope: String(form.get('scope')),
        startsAt: date(form.get('startsAt')),
        targets: [
          {
            categoryId: null,
            gameId: null,
            kind: 'ALL_PRODUCTS',
            position: 1,
            productId: null,
            side: 'BENEFITED',
          },
        ],
      },
      'PATCH',
      'promotions',
    );
  };
  return (
    <section className="cut-panel admin-module" id="record-editors">
      <h2>Editar operaciones</h2>
      <div className="admin-form-grid">
        <form hidden={area !== 'preorders'} onSubmit={(event) => void preorder(event)}>
          <h3>Campaña de preventa</h3>
          <ItemSelect
            items={preorders}
            label="Campaña"
            name="id"
            onSelect={(item, form) =>
              fillForm(form, item, {
                capacity: 'capacity',
                maxPerCustomer: 'maxPerCustomer',
                closesAt: 'closesAt',
                estimatedArrivalText: 'arrival',
                fulfillmentGroupKey: 'groupKey',
                opensAt: 'opensAt',
                productId: 'productId',
              })
            }
          />
          <ItemSelect items={products} label="Producto" name="productId" />
          <StoreField store={store} />
          <label>
            Unidades disponibles en total
            <input min="1" name="capacity" required type="number" />
          </label>
          <label>
            Máximo por cliente (opcional)
            <input min="1" name="maxPerCustomer" type="number" />
          </label>
          <label>
            Apertura
            <input name="opensAt" required type="datetime-local" />
          </label>
          <label>
            Cierre
            <input name="closesAt" required type="datetime-local" />
          </label>
          <label>
            Llegada estimada
            <input name="arrival" required />
          </label>
          <label>
            Grupo de entrega opcional
            <input name="groupKey" />
          </label>
          <button disabled={store === null}>Guardar preventa</button>
        </form>
        <form hidden={area !== 'loyalty'} onSubmit={(event) => void loyaltyEdit(event)}>
          <h3>Configuración de puntos</h3>
          <ItemSelect
            items={loyalty}
            label="Configuración"
            name="id"
            onSelect={(item, form) =>
              fillForm(form, item, {
                earnClpPerPoint: 'earn',
                maximumRedeemBasisPoints: 'maximum',
                minimumRedeemPoints: 'minimum',
                redeemClpPerPoint: 'redeem',
              })
            }
          />
          <label>
            CLP por punto acumulado
            <input min="1" name="earn" required type="number" />
          </label>
          <label>
            CLP por punto canjeado
            <input min="1" name="redeem" required type="number" />
          </label>
          <label>
            Mínimo de canje
            <input min="0" name="minimum" required type="number" />
          </label>
          <label>
            Máximo canjeable
            <input max="10000" min="1" name="maximum" type="number" />
          </label>
          <button>Guardar configuración de puntos</button>
        </form>
        <form hidden={area !== 'configuration'} onSubmit={(event) => void configEdit(event)}>
          <h3>Versión de configuración</h3>
          <ItemSelect
            items={configurations}
            label="Versión"
            name="id"
            onSelect={(item, form) => fillForm(form, item, { reason: 'reason', value: 'value' })}
          />
          <label>
            Valor
            <input name="value" required />
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button>Guardar configuración</button>
        </form>
        <form hidden={area !== 'promotions'} onSubmit={(event) => void promotion(event)}>
          <h3>Promoción porcentual general</h3>
          <ItemSelect
            items={promotions}
            label="Promoción"
            name="id"
            onSelect={(item, form) => {
              fillForm(form, item, {
                activationMode: 'activationMode',
                branchId: 'branchId',
                channel: 'channel',
                endsAt: 'endsAt',
                globalLimit: 'globalLimit',
                minimumEligibleAmountClp: 'minimumAmount',
                minimumEligibleQuantity: 'minimumQuantity',
                name: 'name',
                perAccountLimit: 'perAccountLimit',
                priority: 'priority',
                scope: 'scope',
                startsAt: 'startsAt',
              });
              const benefit = item.benefit;
              if (isItem(benefit) && benefit.type === 'PERCENTAGE_DISCOUNT')
                setField(form, 'basisPoints', benefit.basisPoints);
            }}
          />
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descuento (puntos base)
            <input max="10000" min="1" name="basisPoints" required type="number" />
          </label>
          <label>
            Inicio
            <input name="startsAt" required type="datetime-local" />
          </label>
          <label>
            Fin
            <input name="endsAt" required type="datetime-local" />
          </label>
          <label>
            Canal
            <select name="channel">
              <option value="BOTH">Tienda y POS</option>
              <option value="ECOMMERCE">Tienda online</option>
              <option value="POS">POS</option>
            </select>
          </label>
          <label>
            Alcance
            <select name="scope">
              <option value="ORDER">Pedido</option>
              <option value="LINE">Línea</option>
            </select>
          </label>
          <label>
            Activación
            <select name="activationMode">
              <option value="AUTOMATIC">Automática</option>
              <option value="COUPON_REQUIRED">Requiere cupón</option>
            </select>
          </label>
          <input name="branchId" type="hidden" />
          <label>
            Prioridad
            <input defaultValue="0" name="priority" required type="number" />
          </label>
          <label>
            Monto mínimo
            <input min="1" name="minimumAmount" type="number" />
          </label>
          <label>
            Cantidad mínima
            <input min="1" name="minimumQuantity" type="number" />
          </label>
          <label>
            Límite global
            <input min="1" name="globalLimit" type="number" />
          </label>
          <label>
            Límite por cuenta
            <input min="1" name="perAccountLimit" type="number" />
          </label>
          <button>Guardar promoción</button>
        </form>
      </div>
    </section>
  );
}

interface EditorialDraft {
  readonly document: EditorialDocumentValue;
  readonly excerpt: string;
  readonly id: string;
  readonly metadata: Record<string, unknown>;
  readonly slug: string;
  readonly title: string;
  readonly type: string;
}

interface EditorialEventValue {
  readonly startsAt: string;
  readonly status: 'UPCOMING' | 'COMPLETED';
}

function EditorialVisualEditor({
  content,
  onAction,
}: {
  readonly content: readonly Item[];
  readonly onAction: AdminAction;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<EditorialDraft | null>(null);
  const [message, setMessage] = useState(
    'Selecciona un borrador para ordenar texto e imágenes en una vista previa real.',
  );

  const select = (id: string) => {
    setSelectedId(id);
    const selected = content.find((item) => itemIdentifier(item) === id);
    setDraft(selected ? editorialDraft(selected) : null);
    setMessage(
      selected ? 'Publicación cargada en el editor visual.' : 'Selecciona una publicación.',
    );
  };
  const updateBlock = (index: number, block: EditorialBlock) => {
    if (draft === null) return;
    const blocks = [...draft.document.blocks];
    blocks[index] = block;
    setDraft({ ...draft, document: { blocks, version: 1 } });
  };
  const moveBlock = (index: number, delta: number) => {
    if (draft === null) return;
    const target = index + delta;
    if (target < 0 || target >= draft.document.blocks.length) return;
    const blocks = [...draft.document.blocks];
    const current = blocks[index];
    const replacement = blocks[target];
    if (current === undefined || replacement === undefined) return;
    blocks[index] = replacement;
    blocks[target] = current;
    setDraft({ ...draft, document: { blocks, version: 1 } });
  };
  const removeBlock = (index: number) => {
    if (draft === null) return;
    setDraft({
      ...draft,
      document: {
        blocks: draft.document.blocks.filter((_block, blockIndex) => blockIndex !== index),
        version: 1,
      },
    });
  };
  const updateEvent = (patch: Partial<EditorialEventValue>) => {
    setDraft((currentDraft) => {
      if (currentDraft === null) return null;
      const current = eventFromMetadata(currentDraft.metadata) ?? {
        startsAt: '',
        status: 'UPCOMING',
      };
      return {
        ...currentDraft,
        metadata: { ...currentDraft.metadata, event: { ...current, ...patch } },
      };
    });
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null) return;
    const blocks = draft.document.blocks.flatMap((block) =>
      block.type === 'TEXT' && block.text.trim() === ''
        ? []
        : [block.type === 'TEXT' ? { ...block, text: block.text.trim() } : block],
    );
    const body = blocks
      .flatMap((block) => (block.type === 'TEXT' ? [block.text] : []))
      .join('\n\n')
      .trim();
    const saved = await onAction(
      `/api/v1/admin/content/${draft.id}`,
      {
        body: body || draft.excerpt,
        excerpt: draft.excerpt,
        metadata: { ...draft.metadata, document: { blocks, version: 1 } },
        slug: draft.slug,
        title: draft.title,
        type: draft.type,
      },
      'PUT',
      'content',
    );
    if (saved === false) {
      setMessage('No se guardó la publicación. Revisa el error indicado; tu texto sigue aquí.');
      return;
    }
    setDraft({ ...draft, document: { blocks, version: 1 } });
    setMessage('Diseño editorial guardado.');
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === null) return;
    const form = event.currentTarget;
    setMessage('Subiendo y validando imagen…');
    try {
      const blocks = draft.document.blocks.filter(
        (block) => block.type !== 'TEXT' || block.text.trim() !== '',
      );
      const body = blocks
        .flatMap((block) => (block.type === 'TEXT' ? [block.text] : []))
        .join('\n\n')
        .trim();
      const saved = await onAction(
        `/api/v1/admin/content/${draft.id}`,
        {
          body: body || draft.excerpt,
          excerpt: draft.excerpt,
          metadata: { ...draft.metadata, document: { blocks, version: 1 } },
          slug: draft.slug,
          title: draft.title,
          type: draft.type,
        },
        'PUT',
        'content',
      );
      if (saved === false) {
        setMessage(
          'No se pudo guardar el texto. La imagen todavía no se subió y tus cambios siguen aquí.',
        );
        return;
      }
      const result = await authorizedRequest<{ item: Item }>(
        `/api/v1/admin/content/${draft.id}/resources`,
        {
          body: new FormData(form),
          headers: { 'idempotency-key': crypto.randomUUID() },
          method: 'POST',
        },
      );
      setDraft(editorialDraft(result.item));
      setMessage('Imagen insertada en la publicación. Puedes moverla o cambiar su ajuste.');
      form.reset();
    } catch (error) {
      setMessage(messageOf(error));
    }
  };

  return (
    <section className="cut-panel admin-module editorial-admin-editor" id="editorial-visual-editor">
      <div className="editorial-editor-heading">
        <div>
          <p className="eyebrow">Editor visual</p>
          <h2>Diseñar publicación</h2>
          <p>Ordena bloques y decide cómo el texto se acomoda alrededor de cada imagen.</p>
        </div>
        <label>
          Publicación
          <select onChange={(event) => select(event.target.value)} value={selectedId}>
            <option value="">Selecciona</option>
            {content.map((item) => {
              const id = itemIdentifier(item);
              return id ? (
                <option key={id} value={id}>
                  {itemReference(item)}
                </option>
              ) : null;
            })}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="status">
        {message}
      </p>
      {draft !== null && (
        <>
          <form className="editorial-details-form" onSubmit={(event) => void save(event)}>
            <label>
              Tipo
              <select
                onChange={(event) => {
                  const type = event.target.value;
                  const metadata = metadataForEditorialType(draft.metadata, type);
                  setDraft({ ...draft, metadata, type });
                }}
                value={draft.type}
              >
                <option value="NEWS">Noticia</option>
                <option value="TOURNAMENT">Torneo informativo</option>
                <option value="COMMUNITY">Comunidad</option>
                {draft.type === 'QUEST' && (
                  <option disabled value="QUEST">
                    Quest (contenido heredado)
                  </option>
                )}
              </select>
            </label>
            {supportsEventMetadata(draft.type) && (
              <>
                <label>
                  Estado del evento
                  <select
                    onChange={(event) =>
                      updateEvent({ status: event.target.value as EditorialEventValue['status'] })
                    }
                    value={eventFromMetadata(draft.metadata)?.status ?? 'UPCOMING'}
                  >
                    <option value="UPCOMING">Próximo</option>
                    <option value="COMPLETED">Realizado</option>
                  </select>
                </label>
                <label>
                  Fecha y hora
                  <input
                    onChange={(event) =>
                      updateEvent({
                        startsAt: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : '',
                      })
                    }
                    required
                    type="datetime-local"
                    value={dateTimeLocalValue(eventFromMetadata(draft.metadata)?.startsAt)}
                  />
                </label>
              </>
            )}
            {draft.type === 'NEWS' && (
              <label>
                Categoría de noticia
                <input
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      metadata: { ...draft.metadata, category: event.target.value },
                    })
                  }
                  required
                  value={newsCategoryFromMetadata(draft.metadata)}
                />
              </label>
            )}
            <label>
              Título
              <input
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
                value={draft.title}
              />
            </label>
            <label>
              Slug
              <input
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                pattern="[a-z0-9-]+"
                required
                value={draft.slug}
              />
            </label>
            <label className="editorial-field-wide">
              Resumen
              <textarea
                onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })}
                required
                value={draft.excerpt}
              />
            </label>
            <div className="editorial-block-list editorial-field-wide">
              <div className="editorial-block-toolbar">
                <h3>Bloques de la publicación</h3>
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      document: {
                        blocks: [
                          ...draft.document.blocks,
                          { id: crypto.randomUUID(), text: '', type: 'TEXT' },
                        ],
                        version: 1,
                      },
                    })
                  }
                  type="button"
                >
                  Añadir texto
                </button>
              </div>
              {draft.document.blocks.map((block, index) => (
                <article className="editorial-block-editor" key={block.id}>
                  <div className="editorial-block-toolbar">
                    <strong>{block.type === 'TEXT' ? 'Texto' : 'Imagen'}</strong>
                    <div className="admin-inline-actions">
                      <button
                        disabled={index === 0}
                        onClick={() => moveBlock(index, -1)}
                        type="button"
                      >
                        Subir
                      </button>
                      <button
                        disabled={index === draft.document.blocks.length - 1}
                        onClick={() => moveBlock(index, 1)}
                        type="button"
                      >
                        Bajar
                      </button>
                      <button onClick={() => removeBlock(index)} type="button">
                        Quitar
                      </button>
                    </div>
                  </div>
                  {block.type === 'TEXT' ? (
                    <label>
                      Texto
                      <textarea
                        onChange={(event) =>
                          updateBlock(index, { ...block, text: event.target.value })
                        }
                        rows={5}
                        value={block.text}
                      />
                    </label>
                  ) : (
                    <div className="editorial-image-controls">
                      <EditorialAdminImage block={block} editorialEntryId={draft.id} />
                      <label>
                        Ajuste con el texto
                        <select
                          onChange={(event) =>
                            updateBlock(index, {
                              ...block,
                              placement: event.target.value as EditorialImagePlacement,
                            })
                          }
                          value={block.placement}
                        >
                          <option value="LEFT">Izquierda, texto alrededor</option>
                          <option value="RIGHT">Derecha, texto alrededor</option>
                          <option value="CENTER">Centrada</option>
                          <option value="FULL">Ancho completo</option>
                        </select>
                      </label>
                      <label>
                        Tamaño
                        <select
                          onChange={(event) =>
                            updateBlock(index, {
                              ...block,
                              width: event.target.value as EditorialImageWidth,
                            })
                          }
                          value={block.width}
                        >
                          <option value="SMALL">Pequeña</option>
                          <option value="MEDIUM">Mediana</option>
                          <option value="LARGE">Grande</option>
                        </select>
                      </label>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <button className="editorial-field-wide">Guardar publicación</button>
          </form>
          <div className="editorial-editor-columns">
            <form encType="multipart/form-data" onSubmit={(event) => void upload(event)}>
              <h3>Insertar imagen</h3>
              <label>
                Archivo
                <input
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  name="file"
                  required
                  type="file"
                />
              </label>
              <label>
                Descripción accesible
                <input name="altText" required />
              </label>
              <label>
                Ajuste inicial
                <select defaultValue="CENTER" name="placement">
                  <option value="LEFT">Izquierda, texto alrededor</option>
                  <option value="RIGHT">Derecha, texto alrededor</option>
                  <option value="CENTER">Centrada</option>
                  <option value="FULL">Ancho completo</option>
                </select>
              </label>
              <label>
                Tamaño inicial
                <select defaultValue="MEDIUM" name="width">
                  <option value="SMALL">Pequeña</option>
                  <option value="MEDIUM">Mediana</option>
                  <option value="LARGE">Grande</option>
                </select>
              </label>
              <small>
                El servidor reduce el peso de la imagen cuando es posible sin cambiar su formato ni
                deformarla.
              </small>
              <button>Subir e insertar</button>
            </form>
            <section className="editorial-live-preview" aria-label="Vista previa de la publicación">
              <p className="eyebrow">Vista previa</p>
              <h3>{draft.title}</h3>
              <p>{draft.excerpt}</p>
              <EditorialDocumentView
                document={draft.document}
                renderImage={(block) => (
                  <EditorialAdminImage block={block} editorialEntryId={draft.id} />
                )}
              />
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function editorialDraft(item: Item): EditorialDraft {
  const id = itemIdentifier(item);
  if (id === null) throw new Error('La publicación no tiene un identificador válido.');
  const body = String(item.body ?? '');
  const metadata = isItem(item.metadata) ? item.metadata : {};
  return {
    document: documentFromMetadata(metadata, body, id),
    excerpt: String(item.excerpt ?? ''),
    id,
    metadata,
    slug: String(item.slug ?? ''),
    title: String(item.title ?? ''),
    type: String(item.type ?? 'NEWS'),
  };
}

function supportsEventMetadata(type: string): boolean {
  return type === 'TOURNAMENT' || type === 'QUEST';
}

function eventFromMetadata(metadata: Record<string, unknown>): EditorialEventValue | null {
  const event = metadata.event;
  if (!isItem(event)) return null;
  const startsAt = typeof event.startsAt === 'string' ? event.startsAt : '';
  const status = event.status;
  if (status !== 'UPCOMING' && status !== 'COMPLETED') return null;
  return { startsAt, status };
}

function metadataForEditorialType(
  metadata: Record<string, unknown>,
  type: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) =>
        (key !== 'event' || supportsEventMetadata(type)) &&
        (key !== 'category' || type === 'NEWS') &&
        key !== 'comic',
    ),
  );
}

function newsCategoryFromMetadata(metadata: Record<string, unknown>): string {
  return typeof metadata.category === 'string' && metadata.category.trim()
    ? metadata.category
    : 'General';
}

function dateTimeLocalValue(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function EditorialAdminImage({
  block,
  editorialEntryId,
}: {
  readonly block: Extract<EditorialBlock, { type: 'IMAGE' }>;
  readonly editorialEntryId: string;
}) {
  const [source, setSource] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void authorizedBlob(
      `/api/v1/admin/content/${editorialEntryId}/resources/${block.resourceId}/content`,
    )
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setSource('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [block.resourceId, editorialEntryId]);
  return source ? <img alt={block.altText} src={source} /> : <span>Cargando imagen…</span>;
}

function ItemSelect({
  allowEmpty = false,
  disabled = false,
  items,
  label,
  name,
  onChange,
  onSelect,
  value,
}: {
  readonly allowEmpty?: boolean;
  readonly disabled?: boolean;
  readonly items: readonly Item[];
  readonly label: string;
  readonly name: string;
  readonly onChange?: (value: string) => void;
  readonly onSelect?: (item: Item, form: HTMLFormElement) => void;
  readonly value?: string;
}) {
  return (
    <label>
      {label}
      <select
        disabled={disabled}
        name={name}
        onChange={(event) => {
          onChange?.(event.target.value);
          const form = event.currentTarget.form;
          const item = items.find((candidate) => itemIdentifier(candidate) === event.target.value);
          if (form && item) onSelect?.(item, form);
        }}
        required={!allowEmpty}
        value={value}
      >
        {<option value="">{allowEmpty ? 'Sin asignar' : 'Selecciona'}</option>}
        {items.map((item) => {
          const id = itemIdentifier(item);
          return id ? (
            <option key={id} value={id}>
              {itemReference(item)}
            </option>
          ) : null;
        })}
      </select>
    </label>
  );
}
function fillForm(form: HTMLFormElement, item: Item, mapping: Readonly<Record<string, string>>) {
  for (const [source, target] of Object.entries(mapping)) setField(form, target, item[source]);
}
function setField(form: HTMLFormElement, name: string, value: unknown) {
  const field = form.elements.namedItem(name);
  if (!(
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ))
    return;
  if (value === null || value === undefined) field.value = '';
  else if (field instanceof HTMLInputElement && field.type === 'datetime-local')
    field.value = new Date(
      new Date(String(value)).getTime() - new Date(String(value)).getTimezoneOffset() * 60_000,
    )
      .toISOString()
      .slice(0, 16);
  else field.value = String(value);
}
function isItem(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nullable(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}
function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}
function date(value: FormDataEntryValue | null): string {
  return new Date(String(value)).toISOString();
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}
