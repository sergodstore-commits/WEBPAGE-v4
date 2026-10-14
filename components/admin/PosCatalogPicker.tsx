'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ImageIcon, Plus, Package } from 'lucide-react';
import { money, price } from '@/lib/client';
import type { Product } from '@/lib/types';
import type { PosTicketLine } from '@/lib/pos-menu';
import {
  posCatalogFamilies,
  posCatalogSearch,
  posCatalogSections,
  posVariantLabel,
  type PosCatalogFamily,
  type PosCatalogSection,
} from '@/lib/pos-catalog';
import styles from './PosCatalog.module.css';

function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.image}>
      {product.images[0] && !failed ? (
        <img
          key={product.images[0]}
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon size={28} aria-label="Sin imagen" />
      )}
    </div>
  );
}
function FamilyCard({
  family,
  ticket,
  busy,
  onAdd,
}: {
  family: PosCatalogFamily;
  ticket: PosTicketLine[];
  busy: boolean;
  onAdd: (p: Product) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const grouped = family.section === 'accessories' && family.variants.length > 1;
  const selected = grouped ? family.variants.find((p) => p.id === selectedId) : family.variants[0];
  const preview = selected || family.variants.find((p) => p.available > 0) || family.variants[0];
  const quantity = ticket.find((line) => line.product.id === selected?.id)?.quantity || 0;
  const available = selected ? Math.max(0, selected.available - quantity) : 0;
  return (
    <article className={styles.card} aria-label={family.name}>
      <ProductImage key={preview.id} product={preview} />
      <div className={styles.body}>
        <small>{preview.brand || preview.category}</small>
        <h3>{family.name}</h3>
        {grouped ? (
          <label>
            Color, formato o tipo
            <select
              aria-label={`Variante de ${family.name}`}
              value={selected?.id || ''}
              disabled={busy}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Selecciona una variante</option>
              {family.variants.map((p) => (
                <option key={p.id} value={p.id}>
                  {posVariantLabel(p)} · {money(price(p))}
                  {p.available < 1 ? ' · Sin stock' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          Object.keys(preview.options || {}).length > 0 && (
            <p className={styles.options}>
              {Object.entries(preview.options)
                .map(([key, value]) => `${key}: ${value}`)
                .join(' · ')}
            </p>
          )
        )}
        {selected ? (
          <>
            <div className={styles.price}>
              <strong>{money(price(selected))}</strong>
              <span>{available > 0 ? `${available} para agregar` : 'Sin stock disponible'}</span>
            </div>
            <small className={styles.sku}>{selected.sku}</small>
          </>
        ) : (
          <p className={styles.hint}>
            {family.variants.length} variantes · elige una para ver precio y stock
          </p>
        )}
        <button
          type="button"
          className="admin-button"
          disabled={busy || !selected || available < 1 || quantity >= 100}
          onClick={() => selected && onAdd(selected)}
        >
          <Plus size={16} />
          {!selected ? 'Elegir variante' : available > 0 ? 'Agregar al ticket' : 'Sin stock'}
        </button>
      </div>
    </article>
  );
}
export function PosCatalogPicker({
  products,
  query,
  ticket,
  busy,
  onAdd,
}: {
  products: Product[];
  query: string;
  ticket: PosTicketLine[];
  busy: boolean;
  onAdd: (p: Product) => void;
}) {
  const [section, setSection] = useState<PosCatalogSection>('all');
  const families = posCatalogFamilies(products);
  const matches = posCatalogSearch(families, query, section);
  const count = (id: PosCatalogSection) =>
    id === 'all' ? families.length : families.filter((family) => family.section === id).length;
  return (
    <div className={styles.catalog}>
      <div className={styles.filters} role="group" aria-label="Tipos de productos del POS">
        {posCatalogSections.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={section === item.id}
            disabled={busy}
            onClick={() => setSection(item.id)}
          >
            {item.label}
            <span>{count(item.id)}</span>
          </button>
        ))}
      </div>
      <p className={styles.help}>
        {matches.length} {matches.length === 1 ? 'grupo o producto' : 'grupos y productos'} ·
        accesorios agrupados; sobres, cajas y kits por presentación.
      </p>
      {matches.length ? (
        <div className={styles.grid}>
          {matches.map((family) => (
            <FamilyCard key={family.id} family={family} ticket={ticket} busy={busy} onAdd={onAdd} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <Package size={28} />
          <h3>No hay coincidencias en esta categoría</h3>
          <p>
            El POS muestra artículos publicados de tipo Tienda, incluidos los que están sin stock.
            Las preventas y borradores se gestionan desde Artículos.
          </p>
          <Link href="/admin/articulos">Revisar artículos</Link>
        </div>
      )}
    </div>
  );
}
