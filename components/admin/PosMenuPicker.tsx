'use client';
import { useEffect, useState } from 'react';
import { Beer, CupSoda, Sandwich, Plus } from 'lucide-react';
import { api, money } from '@/lib/client';
import { useRemote } from '../store/shared';
import {
  POS_COMPLETE_ID,
  POS_PROMO_PRICE,
  posMenuRemaining,
  type PosMenuItem,
  type PosTicketLine,
  type PosTicketProduct,
} from '@/lib/pos-menu';
import styles from './PosMenu.module.css';
import { posMenuMatches, posPromoMatches, type PosDrinkSection } from '@/lib/pos-browse';

function StockRow({
  item,
  onSaved,
  disabled,
}: {
  item: PosMenuItem;
  onSaved: (items: PosMenuItem[]) => void;
  disabled: boolean;
}) {
  const [stock, setStock] = useState(String(item.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(
        await api<PosMenuItem[]>('/admin/pos/menu', {
          method: 'PATCH',
          body: JSON.stringify({
            id: item.id,
            stock: Number(stock),
            expected_version: item.version,
          }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se guardó el stock.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className={styles.stockRow}>
      <label>
        {item.name}
        <input
          aria-label={`Stock de ${item.name}`}
          type="number"
          min="0"
          max="100000"
          step="1"
          required
          value={stock}
          disabled={busy || disabled}
          onChange={(e) => setStock(e.target.value)}
        />
      </label>
      <button
        className="admin-button secondary"
        disabled={busy || disabled || Number(stock) === item.stock}
      >
        {busy ? 'Guardando…' : 'Guardar stock'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function PosMenuPicker({
  ticket,
  busy,
  onAdd,
  onMenuChange,
  query,
  category = 'all',
  drinkSection = 'all',
}: {
  ticket: PosTicketLine[];
  busy: boolean;
  onAdd: (product: PosTicketProduct) => void;
  onMenuChange: (items: PosMenuItem[]) => void;
  query: string;
  category?: 'all' | 'beverages' | 'food' | 'promos';
  drinkSection?: PosDrinkSection;
}) {
  const remote = useRemote<PosMenuItem[]>('/admin/pos/menu');
  const [menu, setMenu] = useState<PosMenuItem[]>([]);
  const [beverage, setBeverage] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (remote.data) {
      setMenu(remote.data);
      onMenuChange(remote.data);
    }
  }, [remote.data, onMenuChange]);
  const remaining = posMenuRemaining(menu, ticket);
  const matches = posMenuMatches(menu, query, category, drinkSection);
  const showPromo = (category === 'all' || category === 'promos') && posPromoMatches(menu, query);
  const drinks = menu.filter((item) => item.kind === 'beverage' && !item.alcoholic);
  const selected = menu.find((item) => item.id === beverage);
  const complete = menu.find((item) => item.id === POS_COMPLETE_ID);
  const promoAvailable = Math.max(
    0,
    Math.min(remaining.get(POS_COMPLETE_ID) || 0, remaining.get(beverage) || 0),
  );
  if (remote.loading) return <p role="status">Cargando menú y existencias…</p>;
  if (remote.error)
    return (
      <div role="alert">
        <p>{remote.error}</p>
        <button type="button" className="admin-button secondary" onClick={remote.reload}>
          Reintentar menú
        </button>
      </div>
    );
  return (
    <div className={styles.menu}>
      <div className={styles.intro}>
        <strong>
          {category === 'beverages'
            ? 'Bebidas'
            : category === 'food'
              ? 'Comida · completos'
              : category === 'promos'
                ? 'Promos del local'
                : 'Bebidas, comida y promos'}
        </strong>
        <span>Solo venta presencial · stock independiente</span>
        <button type="button" className="admin-text-button" disabled={busy} onClick={remote.reload}>
          Actualizar existencias
        </button>
      </div>
      {showPromo && (
        <section className={styles.promo} aria-label="Promo completo y bebida">
          <div>
            <Sandwich aria-hidden="true" />
            <strong>Completo + bebida</strong>
            <b>{money(POS_PROMO_PRICE)}</b>
          </div>
          <label>
            Bebida de la promo
            <select
              aria-label="Bebida de la promo"
              value={beverage}
              disabled={busy}
              onChange={(e) => setBeverage(e.target.value)}
            >
              <option value="">Selecciona una bebida sin alcohol</option>
              {drinks.map((item) => (
                <option value={item.id} key={item.id} disabled={(remaining.get(item.id) || 0) < 1}>
                  {item.name}
                  {item.stock === 0 ? ' · Sin stock' : ''}
                </option>
              ))}
            </select>
          </label>
          <small>
            Descuenta un completo y la bebida elegida. Ahorra{' '}
            {money((complete?.price || 2000) + (selected?.price || 1500) - POS_PROMO_PRICE)}.
          </small>
          <button
            type="button"
            className="admin-button"
            disabled={busy || !selected || promoAvailable < 1}
            onClick={() =>
              selected &&
              onAdd({
                id: `promo-${selected.id}`,
                name: `Promo completo + ${selected.name}`,
                sku: `PROMO-${selected.code}`,
                price: POS_PROMO_PRICE,
                discount_percent: 0,
                available: Math.min(complete?.stock || 0, selected.stock),
                images: [],
                promo_beverage_id: selected.id,
              })
            }
          >
            <Plus size={17} />
            {promoAvailable > 0 ? 'Agregar promo' : 'Promo sin stock disponible'}
          </button>
        </section>
      )}
      {!showPromo && matches.length === 0 && (
        <p role="status">
          No hay coincidencias en esta categoría. Prueba otro nombre o selecciona «Todos».
        </p>
      )}
      <div className={styles.grid}>
        {matches.map((item) => {
          const available = Math.max(0, remaining.get(item.id) || 0);
          const Icon = item.kind === 'food' ? Sandwich : item.alcoholic ? Beer : CupSoda;
          return (
            <button
              type="button"
              key={item.id}
              className={styles.item}
              disabled={busy || available < 1}
              onClick={() =>
                onAdd({
                  id: item.id,
                  name: item.name,
                  sku: `MENU-${item.code}`,
                  price: item.price,
                  discount_percent: 0,
                  available: item.stock,
                  images: [],
                  menu_id: item.id,
                })
              }
            >
              <Icon size={24} aria-hidden="true" />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {available > 0 ? `${available} disponibles para agregar` : 'Sin stock'}
                </small>
                <b>{money(item.price)}</b>
              </span>
              <Plus size={17} />
            </button>
          );
        })}
      </div>
      <details className={styles.stock}>
        <summary>Cargar o ajustar existencias del menú</summary>
        <p>
          Ingresa el total real disponible. Una venta descuenta los componentes automáticamente.
        </p>
        {notice && <p role="status">{notice}</p>}
        {(category === 'promos' ? menu : matches).map((item) => (
          <StockRow
            key={`${item.id}-${item.version}`}
            item={item}
            disabled={busy}
            onSaved={(items) => {
              setMenu(items);
              onMenuChange(items);
              setNotice('Stock guardado.');
            }}
          />
        ))}
      </details>
    </div>
  );
}
