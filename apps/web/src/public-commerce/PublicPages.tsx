import { type FormEvent, useEffect, useState } from 'react';

import { publicRequest } from '../identity/api.js';

interface ProductCard {
  readonly availableForPurchase: boolean;
  readonly game: { readonly name: string };
  readonly name: string;
  readonly priceAmountClp: number;
  readonly productId: string;
  readonly saleType: 'PREORDER' | 'REGULAR';
}

interface EditorialEntry {
  readonly editorialEntryId: string;
  readonly excerpt: string;
  readonly slug: string;
  readonly title: string;
  readonly type: string;
}

export function StorePage() {
  const [items, setItems] = useState<readonly ProductCard[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('Cargando catálogo…');
  const load = (q = '') => {
    const params = new URLSearchParams({ limit: '24', sort: 'NEWEST' });
    if (q.trim().length >= 2) params.set('q', q.trim());
    void publicRequest<{ items: ProductCard[] }>(`/api/v1/catalog/products?${params}`)
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length === 0 ? 'No encontramos productos con esos filtros.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  };
  useEffect(load, []);
  const search = (event: FormEvent) => {
    event.preventDefault();
    load(query);
  };
  return (
    <main className="page-frame">
      <header className="section-heading cut-panel">
        <p className="eyebrow">Tienda TCG</p>
        <h1>Catálogo</h1>
        <p>Productos regulares y preventas. Precio, stock y descuentos se confirman en servidor.</p>
      </header>
      <form className="search-bar" onSubmit={search} role="search">
        <label>
          Buscar productos
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Juego, producto o colección"
            value={query}
          />
        </label>
        <button type="submit">Buscar</button>
      </form>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <section className="card-grid" aria-label="Productos">
        {items.map((product) => (
          <article className="commerce-card" key={product.productId}>
            <span className="status-chip">
              {product.saleType === 'PREORDER' ? 'Preventa' : 'Producto'}
            </span>
            <p className="card-kicker">{product.game.name}</p>
            <h2>{product.name}</h2>
            <p className="price">${product.priceAmountClp.toLocaleString('es-CL')}</p>
            <p>{product.availableForPurchase ? 'Disponible' : 'Agotado'}</p>
            <button disabled={!product.availableForPurchase} type="button">
              Agregar al carrito
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

export function EditorialPage({ type, title }: { readonly type: string; readonly title: string }) {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [message, setMessage] = useState('Cargando contenido…');
  useEffect(() => {
    void publicRequest<{ items: EditorialEntry[] }>(
      `/api/v1/content?limit=24&type=${encodeURIComponent(type)}`,
    )
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length === 0 ? 'Todavía no hay publicaciones.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, [type]);
  return (
    <main className="page-frame">
      <header className="section-heading cut-panel">
        <p className="eyebrow">Sergod editorial</p>
        <h1>{title}</h1>
        {type === 'TOURNAMENT' && (
          <p>Calendario, resultados y podios informativos; no administra rondas.</p>
        )}
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <section className="editorial-grid">
        {items.map((item) => (
          <article className="editorial-card" key={item.editorialEntryId}>
            <p className="card-kicker">{item.type.replaceAll('_', ' ')}</p>
            <h2>{item.title}</h2>
            <p>{item.excerpt}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar esta sección.';
}
