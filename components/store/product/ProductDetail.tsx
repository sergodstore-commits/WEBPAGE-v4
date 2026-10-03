'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { date, money, price } from '@/lib/client';
import type { Product } from '@/lib/types';
import type { AddToCart } from '../shared';
import { useRemote, availability, familyName, Loading, RemoteError, ProductImage } from '../shared';
import styles from './ProductDetail.module.css';
function VariantOptions({
  product,
  variants,
  select,
}: {
  product: Product;
  variants: Product[];
  select: (p: Product) => void;
}) {
  const availableKeys = [...new Set(variants.flatMap((p) => Object.keys(p.options || {})))];
  const keys = [
    ...['Formato', 'Color', 'Diseño'].filter((key) => availableKeys.includes(key)),
    ...availableKeys.filter((key) => !['Formato', 'Color', 'Diseño'].includes(key)),
  ];
  if (!keys.length)
    return variants.length > 1 ? (
      <label className={`store-label ${styles.option}`}>
        Opción
        <select
          value={product.id}
          onChange={(e) => {
            const p = variants.find((p) => p.id === e.target.value);
            if (p) select(p);
          }}
        >
          {variants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {availability(p) ? ' · Agotado' : ''}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  return (
    <div className={`store-variant-options ${styles.options}`} aria-label="Opciones del producto">
      {keys.map((key, index) => {
        const preceding = keys.slice(0, index);
        const candidates = variants.filter((p) =>
          preceding.every((k) => p.options?.[k] === product.options?.[k]),
        );
        const values = [...new Set(candidates.map((p) => p.options?.[key]).filter(Boolean))];
        return (
          <label key={key} className={`store-label ${styles.option}`}>
            {key}
            <select
              value={product.options?.[key] || ''}
              onChange={(e) => {
                const matches = candidates.filter((p) => p.options?.[key] === e.target.value);
                const score = (p: Product) =>
                  keys.slice(index + 1).filter((k) => p.options?.[k] === product.options?.[k])
                    .length;
                const selected = matches.sort((a, b) => score(b) - score(a))[0];
                if (selected) select(selected);
              }}
            >
              {values.map((value) => (
                <option key={value} value={value}>
                  {value}
                  {candidates
                    .filter((p) => p.options?.[key] === value)
                    .every((p) => availability(p))
                    ? ' · Agotado'
                    : ''}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

export function QuickProduct({
  product,
  add,
  close,
}: {
  product: Product;
  add: AddToCart;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [slug, setSlug] = useState(product.slug);
  useEffect(() => {
    const element = dialog.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    if (element && !element.open) element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`store-quick-dialog ${styles.quickDialog}`}
      aria-labelledby="quick-product-title"
      onClose={() => {
        // Ignore the stale close event from a development Strict Mode cleanup.
        if (dialog.current && !dialog.current.open) close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={`store-quick-header ${styles.quickHeader}`}>
        <h2 id="quick-product-title">Vista rápida</h2>
        <button
          className={`store-icon-button ${styles.close}`}
          aria-label="Cerrar vista rápida"
          onClick={close}
        >
          <X size={22} />
        </button>
      </div>
      <ProductDetail slug={slug} add={add} quick onSelectVariant={(p) => setSlug(p.slug)} />
      <div className={styles.quickFooter}>
        <Link
          className={`store-button store-button-secondary ${styles.fullDetails}`}
          href={`/producto/${slug}`}
        >
          Ver ficha completa <ArrowRight size={16} />
        </Link>
      </div>
    </dialog>
  );
}

export function ProductDetail({
  slug,
  add,
  quick = false,
  onSelectVariant,
}: {
  slug: string;
  add: AddToCart;
  quick?: boolean;
  onSelectVariant?: (p: Product) => void;
}) {
  const router = useRouter();
  const remote = useRemote<Product>(`/products/${encodeURIComponent(slug)}`),
    [selected, setSelected] = useState(0),
    [quantity, setQuantity] = useState(1),
    [feedback, setFeedback] = useState<ReturnType<AddToCart> | null>(null);
  const siblings = useRemote<Product[]>(
    remote.data?.catalog_group
      ? `/products?group=${encodeURIComponent(remote.data.catalog_group)}&kind=${remote.data.kind}`
      : null,
  );
  useEffect(() => {
    setSelected(0);
    setQuantity(1);
    setFeedback(null);
  }, [slug]);
  if (remote.loading) return <Loading />;
  if (remote.error)
    return (
      <div className="store-page">
        <RemoteError error={remote.error} reload={remote.reload} />
        <Link href="/tienda" className="store-text-link">
          <ArrowLeft size={16} />
          Volver a la tienda
        </Link>
      </div>
    );
  const p = remote.data;
  if (!p) return null;
  if (p.slug !== slug) return <Loading />;
  const closed = availability(p),
    maximum = Math.min(100, p.available, (p.kind === 'preorder' ? p.max_per_customer : 100) || 100);
  const variants = siblings.data?.filter(
    (sibling) => sibling.catalog_group === p.catalog_group && sibling.kind === p.kind,
  ) || [p];
  const selectVariant = (variant: Product) => {
    setQuantity(1);
    setSelected(0);
    if (onSelectVariant) onSelectVariant(variant);
    else router.push(`/producto/${variant.slug}`, { scroll: false });
  };
  return (
    <div
      className={`${quick ? `store-quick-content ${styles.compact}` : 'store-page'} ${styles.product}`}
    >
      {!quick && (
        <nav className={`store-breadcrumb ${styles.breadcrumb}`} aria-label="Ruta">
          <Link href="/">Inicio</Link>
          <span>/</span>
          <Link href={p.kind === 'preorder' ? '/preventas' : '/tienda'}>
            {p.kind === 'preorder' ? 'Preventas' : 'Tienda'}
          </Link>
          <span>/</span>
          <span>{p.name}</span>
        </nav>
      )}
      <div className={`store-detail-layout ${styles.layout}`}>
        <div className={`store-detail-gallery ${styles.gallery}`}>
          <ProductImage
            src={p.images[selected]}
            name={p.name}
            className={`store-detail-main-image ${styles.mainImage}`}
          />
          {p.images.length > 1 && (
            <div
              className={`store-thumbnails ${styles.thumbnails}`}
              aria-label="Galería del producto"
            >
              {p.images.map((src, i) => (
                <button
                  key={src + i}
                  className={i === selected ? 'is-selected' : ''}
                  onClick={() => setSelected(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-pressed={i === selected}
                >
                  <ProductImage src={src} name={`${p.name}, imagen ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={`store-detail-info ${styles.info}`}>
          <span className={`store-eyebrow ${styles.eyebrow}`}>
            {p.category}
            {p.kind === 'preorder' ? ' · PREVENTA' : ''}
          </span>
          {quick ? <h2>{familyName(p)}</h2> : <h1>{familyName(p)}</h1>}
          {p.catalog_name && p.catalog_name !== p.name && (
            <p className={styles.variantName}>{p.name}</p>
          )}
          <p className={`store-sku ${styles.sku}`}>SKU: {p.sku}</p>
          <div className={`store-detail-price ${styles.price}`}>
            <strong>{money(price(p))}</strong>
            {p.discount_percent > 0 && (
              <>
                <del>{money(p.price)}</del>
                <span className={`store-pill ${styles.discount}`}>−{p.discount_percent}%</span>
              </>
            )}
          </div>
          <p className={`store-tax-note ${styles.taxNote}`}>Precio en pesos chilenos</p>
          <div className={`store-detail-stock ${styles.stock}`} aria-live="polite">
            {closed ? (
              <span className={`store-pill ${styles.unavailable}`}>{closed}</span>
            ) : (
              <span className="store-stock-dot">{p.available} unidades disponibles</span>
            )}
          </div>
          {p.catalog_group &&
            (siblings.loading ? (
              <Loading />
            ) : siblings.error ? (
              <RemoteError error={siblings.error} reload={siblings.reload} />
            ) : (
              <VariantOptions product={p} variants={variants} select={selectVariant} />
            ))}
          {p.kind === 'preorder' && (
            <div className={`store-preorder-info ${styles.preorder}`}>
              <h2>
                <CalendarDays size={18} />
                Información de la preventa
              </h2>
              <dl>
                <div>
                  <dt>Apertura</dt>
                  <dd>{date(p.opens_at)}</dd>
                </div>
                <div>
                  <dt>Cierre</dt>
                  <dd>{date(p.closes_at)}</dd>
                </div>
                <div>
                  <dt>Máximo por cliente</dt>
                  <dd>
                    {p.max_per_customer || 'Sin límite adicional'}
                    {p.max_per_customer ? ' unidades' : ''}
                  </dd>
                </div>
              </dl>
              <strong>Condiciones de entrega</strong>
              <p className="store-preline">{p.delivery_terms}</p>
            </div>
          )}
          <div className={`store-purchase-row ${styles.purchase}`}>
            <div className={`store-quantity ${styles.quantity}`}>
              <button
                aria-label="Disminuir cantidad"
                disabled={Boolean(closed) || quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus size={16} />
              </button>
              <input
                aria-label="Cantidad"
                inputMode="numeric"
                type="number"
                min={1}
                max={maximum}
                value={quantity}
                disabled={Boolean(closed)}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(maximum || 1, Math.trunc(Number(e.target.value)) || 1)),
                  )
                }
              />
              <button
                aria-label="Aumentar cantidad"
                disabled={Boolean(closed) || quantity >= maximum}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className={`store-button ${styles.addButton}`}
              disabled={Boolean(closed)}
              onClick={() => {
                const result = add(p, quantity);
                if (quick) setFeedback(result);
              }}
            >
              <ShoppingBag size={18} />
              {p.kind === 'preorder' ? 'Añadir reserva al carrito' : 'Añadir al carrito'}
            </button>
          </div>
          {quick && feedback && (
            <div className={styles.purchaseFeedback} role={feedback.success ? 'status' : 'alert'}>
              <p>{feedback.message}</p>
              {feedback.success && (
                <Link href="/carrito">
                  Ver carrito <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
          <div className={`store-detail-reassurance ${styles.reassurance}`}>
            <span>
              <Store size={17} />
              Retiro en local
            </span>
            <span>
              <Truck size={17} />
              Envío según disponibilidad
            </span>
          </div>
          {!quick && (
            <Link
              href={p.kind === 'preorder' ? '/preventas' : '/tienda'}
              className={`store-text-link ${styles.backLink}`}
            >
              <ArrowLeft size={16} />
              Seguir explorando
            </Link>
          )}
        </div>
      </div>
      <div className={styles.details}>
        <section className={styles.description} aria-label="Descripción del producto">
          <h2>Sobre este artículo</h2>
          <div className="store-description store-preline">{p.description}</div>
        </section>
        {Boolean(p.brand || p.specifications?.length || p.tags?.length) && (
          <section
            className={`store-specifications ${styles.specifications}`}
            aria-label="Ficha técnica"
          >
            <h2>Ficha técnica</h2>
            <dl>
              {p.brand && (
                <div>
                  <dt>Marca</dt>
                  <dd>{p.brand}</dd>
                </div>
              )}
              {(p.specifications || []).map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
            {(p.tags || []).length > 0 && (
              <div className={`store-product-tags ${styles.tags}`}>
                {p.tags.map((tag) => (
                  <span key={tag} className="store-pill">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
