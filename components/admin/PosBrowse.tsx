'use client';
import { useState } from 'react';
import { Search, Layers, Package, CupSoda, Sandwich, Tag } from 'lucide-react';
import type { Product } from '@/lib/types';
import type { PosMenuItem, PosTicketLine, PosTicketProduct } from '@/lib/pos-menu';
import { posCatalogSections, type PosCatalogSection } from '@/lib/pos-catalog';
import {
  posBrowseCategories,
  posAccessorySections,
  type PosBrowseCategory,
  type PosAccessorySection,
  type PosDrinkSection,
} from '@/lib/pos-browse';
import { PosCatalogPicker } from './PosCatalogPicker';
import { PosMenuPicker } from './PosMenuPicker';
import styles from './PosCatalog.module.css';

const icons = {
  all: Layers,
  tcg: Package,
  accessories: Package,
  beverages: CupSoda,
  food: Sandwich,
  promos: Tag,
};
export function PosBrowse({
  products,
  loading,
  error,
  retry,
  ticket,
  busy,
  onAdd,
  onMenuChange,
  menuVersion,
}: {
  products: Product[];
  loading: boolean;
  error: string;
  retry: () => void;
  ticket: PosTicketLine[];
  busy: boolean;
  onAdd: (p: PosTicketProduct) => void;
  onMenuChange: (items: PosMenuItem[]) => void;
  menuVersion: number;
}) {
  const [category, setCategory] = useState<PosBrowseCategory>('all');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<PosCatalogSection>('all');
  const [accessory, setAccessory] = useState<PosAccessorySection>('all');
  const [drink, setDrink] = useState<PosDrinkSection>('all');
  const showCatalog = category === 'all' || category === 'tcg' || category === 'accessories';
  const showMenu =
    category === 'all' || category === 'beverages' || category === 'food' || category === 'promos';
  const subcategories =
    category === 'tcg'
      ? posCatalogSections
          .filter((s) => s.id !== 'accessories')
          .map((s) => ({ ...s, label: s.id === 'all' ? 'Todos los productos TCG' : s.label }))
      : category === 'accessories'
        ? posAccessorySections
        : category === 'beverages'
          ? [
              { id: 'all', label: 'Todas las bebidas' },
              { id: 'soft', label: 'Gaseosas' },
              { id: 'zero', label: 'Sin azúcar' },
              { id: 'beer', label: 'Cerveza' },
            ]
          : [];
  const selectedSubcategory =
    category === 'tcg' ? format : category === 'accessories' ? accessory : drink;
  return (
    <>
      <div className={styles.navigation}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Buscar artículos para venta"
            placeholder="Buscar producto, bebida, completo, color o SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className={styles.categories} role="group" aria-label="Categorías del POS">
          {posBrowseCategories.map((item) => {
            const Icon = icons[item.id];
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setFormat('all');
                  setAccessory('all');
                  setDrink('all');
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        {subcategories.length > 0 && (
          <div className={styles.filters} role="group" aria-label="Subcategorías del POS">
            {subcategories.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-pressed={selectedSubcategory === item.id}
                onClick={() => {
                  if (category === 'tcg') setFormat(item.id as PosCatalogSection);
                  else if (category === 'accessories') setAccessory(item.id as PosAccessorySection);
                  else setDrink(item.id as PosDrinkSection);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {query && (
          <div className={styles.searchScope} role="status">
            Buscando «{query}» en{' '}
            {posBrowseCategories.find((c) => c.id === category)?.label.toLowerCase()}.
            <button
              type="button"
              className="admin-text-button"
              onClick={() => {
                setCategory('all');
                setFormat('all');
                setAccessory('all');
                setDrink('all');
              }}
            >
              Buscar en todo
            </button>
            <button type="button" className="admin-text-button" onClick={() => setQuery('')}>
              Limpiar
            </button>
          </div>
        )}
      </div>
      <div hidden={!showMenu}>
        <PosMenuPicker
          key={menuVersion}
          ticket={ticket}
          busy={busy}
          onAdd={onAdd}
          onMenuChange={onMenuChange}
          query={query}
          category={
            category === 'beverages' || category === 'food' || category === 'promos'
              ? category
              : 'all'
          }
          drinkSection={drink}
        />
      </div>
      {showCatalog &&
        (loading ? (
          <p className={styles.catalog} role="status">
            Cargando productos…
          </p>
        ) : error ? (
          <div className={styles.catalog} role="alert">
            <p>{error}</p>
            <button type="button" className="admin-button secondary" onClick={retry}>
              Reintentar productos
            </button>
          </div>
        ) : (
          <PosCatalogPicker
            products={products}
            query={query}
            ticket={ticket}
            busy={busy}
            onAdd={onAdd}
            section={category === 'accessories' ? 'accessories' : format}
            accessorySection={accessory}
            excludeAccessories={category === 'tcg'}
            hideFilters
          />
        ))}
    </>
  );
}
