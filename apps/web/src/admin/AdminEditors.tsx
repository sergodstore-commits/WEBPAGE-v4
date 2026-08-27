import { type FormEvent, useMemo, useState } from 'react';

import { type AuthorizedResponse, authorizedRequest, authorizedResponse } from '../identity/api.js';
import { itemIdentifier, itemReference } from './presentation.js';

type Item = Record<string, unknown>;
export type AdminAction = (
  path: string,
  body: unknown,
  method?: string,
  reload?: string,
) => Promise<void>;

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
      <h2>Editar catálogo</h2>
      <p>Selecciona una entidad y guarda todos los datos que quieras conservar.</p>
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
        <form onSubmit={(event) => void patchProduct(event)}>
          <h3>Producto</h3>
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
            Idioma
            <input name="language" />
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
  products,
}: {
  readonly categories: readonly Item[];
  readonly collections: readonly Item[];
  readonly games: readonly Item[];
  readonly products: readonly Item[];
}) {
  const [owner, setOwner] = useState<(typeof owners)[number]['segment']>('products');
  const [entityId, setEntityId] = useState('');
  const [items, setItems] = useState<readonly Item[]>([]);
  const [etag, setEtag] = useState('');
  const [retireReasons, setRetireReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('Selecciona una entidad y carga sus imágenes.');
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
  const load = async () => {
    if (!entityId) return setMessage('Selecciona una entidad.');
    try {
      const loaded: Item[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let representationEtag = '';
      do {
        const pagePath: string = `${base}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
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
      setItems(loaded);
      setEtag(representationEtag);
      setMessage(loaded.length ? 'Imágenes cargadas.' : 'Esta entidad todavía no tiene imágenes.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return setMessage('Selecciona una entidad.');
    const data = new FormData(event.currentTarget);
    try {
      await authorizedRequest(base, {
        body: data,
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      });
      setMessage('Imagen subida correctamente.');
      await load();
    } catch (error) {
      setMessage(messageOf(error));
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
      await load();
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
      await load();
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
      <h2>Imágenes del catálogo</h2>
      <p className="status" role="status">
        {message}
      </p>
      <div className="admin-form-grid">
        <div>
          <label>
            Tipo
            <select
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value as typeof owner);
                setEntityId('');
                setItems([]);
                setEtag('');
                setRetireReasons({});
              }}
            >
              <option value="products">Producto</option>
              <option value="tcg-games">Juego TCG</option>
              <option value="categories">Categoría</option>
              <option value="collections">Colección</option>
            </select>
          </label>
          <ItemSelect
            items={entities}
            label={owners.find((entry) => entry.segment === owner)?.label ?? 'Entidad'}
            name="resourceEntity"
            onChange={(value) => {
              setEntityId(value);
              setItems([]);
              setEtag('');
              setRetireReasons({});
            }}
            value={entityId}
          />
          <button onClick={() => void load()} type="button">
            Cargar imágenes
          </button>
        </div>
        <form encType="multipart/form-data" onSubmit={(event) => void upload(event)}>
          <h3>Subir imagen</h3>
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
            Texto alternativo
            <input name="altText" required />
          </label>
          <label>
            Posición
            <input min="1" name="position" required type="number" />
          </label>
          <button>Subir imagen</button>
        </form>
      </div>
      {items.map((item, index) => {
        const id = String(item.resourceId);
        return (
          <article className="admin-resource" key={id}>
            <div>
              <strong>{String(item.originalFilenameSafe ?? id)}</strong>
              <p>
                {String(item.altText ?? '')} · posición {String(item.position ?? '')} ·{' '}
                {String(item.state ?? '')}
              </p>
            </div>
            <div className="admin-inline-actions">
              <button disabled={index === 0 || !etag} onClick={() => move(id, -1)} type="button">
                Subir posición
              </button>
              <button
                disabled={index === items.length - 1 || !etag}
                onClick={() => move(id, 1)}
                type="button"
              >
                Bajar posición
              </button>
              <button
                onClick={() => void json(`${base}/primary`, { resourceId: id }, 'PUT')}
                type="button"
              >
                Hacer principal
              </button>
              <button
                onClick={() => {
                  const reason = retireReasons[id]?.trim();
                  if (!reason) return setMessage('Indica el motivo para retirar la imagen.');
                  void json(`${base}/${id}/retirements`, { reason }, 'POST');
                }}
                type="button"
              >
                Retirar
              </button>
            </div>
            <label>
              Motivo de retiro
              <input
                name="retireReason"
                onChange={(event) =>
                  setRetireReasons((current) => ({ ...current, [id]: event.target.value }))
                }
                value={retireReasons[id] ?? ''}
              />
            </label>
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
                Texto alternativo
                <input defaultValue={String(item.altText ?? '')} name="altText" required />
              </label>
              <label>
                Motivo
                <input name="reason" required />
              </label>
              <button>Reemplazar</button>
            </form>
          </article>
        );
      })}
    </section>
  );
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
}: {
  readonly area: 'configuration' | 'content' | 'loyalty' | 'preorders' | 'promotions';
  readonly content: readonly Item[];
  readonly configurations: readonly Item[];
  readonly loyalty: readonly Item[];
  readonly onAction: AdminAction;
  readonly preorders: readonly Item[];
  readonly products: readonly Item[];
  readonly promotions: readonly Item[];
}) {
  const preorder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/preorders/campaigns/${String(form.get('id'))}`,
      {
        branchId: String(form.get('branchId')),
        capacity: Number(form.get('capacity')),
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
  const editorial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/content/${String(form.get('id'))}`,
      {
        body: String(form.get('body')),
        excerpt: String(form.get('excerpt')),
        metadata: {},
        slug: String(form.get('slug')),
        title: String(form.get('title')),
        type: String(form.get('type')),
      },
      'PUT',
      'content',
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
                branchId: 'branchId',
                capacity: 'capacity',
                closesAt: 'closesAt',
                estimatedArrivalText: 'arrival',
                fulfillmentGroupKey: 'groupKey',
                opensAt: 'opensAt',
                productId: 'productId',
              })
            }
          />
          <ItemSelect items={products} label="Producto" name="productId" />
          <label>
            Sucursal
            <input name="branchId" required />
          </label>
          <label>
            Cupos
            <input min="1" name="capacity" required type="number" />
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
            Grupo fulfillment
            <input name="groupKey" />
          </label>
          <button>Guardar preventa</button>
        </form>
        <form hidden={area !== 'loyalty'} onSubmit={(event) => void loyaltyEdit(event)}>
          <h3>Configuración loyalty</h3>
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
          <button>Guardar loyalty</button>
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
        <form hidden={area !== 'content'} onSubmit={(event) => void editorial(event)}>
          <h3>Contenido editorial</h3>
          <ItemSelect
            items={content}
            label="Contenido"
            name="id"
            onSelect={(item, form) =>
              fillForm(form, item, {
                body: 'body',
                excerpt: 'excerpt',
                slug: 'slug',
                title: 'title',
                type: 'type',
              })
            }
          />
          <label>
            Tipo
            <select name="type">
              <option value="NEWS">Noticia</option>
              <option value="TOURNAMENT">Torneo</option>
              <option value="COMMUNITY">Comunidad</option>
              <option value="COMIC_SERIES">Serie de cómic</option>
              <option value="COMIC_CHAPTER">Capítulo</option>
              <option value="QUEST">Quest</option>
              <option value="HALL_OF_FAME">Hall of Fame</option>
            </select>
          </label>
          <label>
            Título
            <input name="title" required />
          </label>
          <label>
            Slug
            <input name="slug" pattern="[a-z0-9-]+" required />
          </label>
          <label>
            Resumen
            <textarea name="excerpt" required />
          </label>
          <label>
            Contenido
            <textarea name="body" required rows={6} />
          </label>
          <button>Guardar contenido</button>
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
          <label>
            Sucursal opcional
            <input name="branchId" />
          </label>
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

function ItemSelect({
  allowEmpty = false,
  items,
  label,
  name,
  onChange,
  onSelect,
  value,
}: {
  readonly allowEmpty?: boolean;
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
    field.value = String(value).slice(0, 16);
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
