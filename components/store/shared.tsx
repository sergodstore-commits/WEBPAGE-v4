'use client';
import { useState, useEffect, type ReactNode } from 'react';
import { Check, PackageOpen, ImageIcon } from 'lucide-react';
import { api } from '@/lib/client';
import type { Product } from '@/lib/types';
export type AddToCart = (
  product: Product,
  quantity?: number,
) => { success: boolean; message: string };
export type Remote<T> = { data: T | null; loading: boolean; error: string; reload: () => void };

export function useRemote<T>(path: string | null): Remote<T> {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(Boolean(path)),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}
export function Status({ message, error = false }: { message: string; error?: boolean }) {
  return message ? (
    <div
      className={`store-message ${error ? 'store-message-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {error ? <span aria-hidden="true">!</span> : <Check size={18} />}
      <div>{message}</div>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="store-loading" role="status">
      <span className="store-spinner" />
      Cargando información…
    </div>
  );
}
export function Empty({
  icon = <PackageOpen size={30} />,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="store-empty">
      <div className="store-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="store-page-intro">
      <div>
        {eyebrow && <div className="store-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {children}
    </div>
  );
}
export function RemoteError({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="store-error-box">
      <Status message={error} error />
      <button className="store-button store-button-secondary" onClick={reload}>
        Volver a intentar
      </button>
    </div>
  );
}
export function ProductImage({
  src,
  name,
  className = '',
}: {
  src?: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`store-product-image ${className}`}>
      {src && !failed ? (
        <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="store-no-image">
          <ImageIcon size={34} strokeWidth={1} />
          <span>Sin imagen disponible</span>
        </div>
      )}
    </div>
  );
}
export function availability(p: Product) {
  const now = Date.now();
  if (
    p.kind === 'preorder' &&
    (!p.opens_at ||
      !p.closes_at ||
      !Number.isFinite(Date.parse(p.opens_at)) ||
      !Number.isFinite(Date.parse(p.closes_at)) ||
      Date.parse(p.opens_at) >= Date.parse(p.closes_at))
  )
    return 'Fechas por confirmar';
  if (p.kind === 'preorder' && p.opens_at && new Date(p.opens_at).getTime() > now)
    return 'La preventa aún no abre';
  if (p.kind === 'preorder' && p.closes_at && new Date(p.closes_at).getTime() <= now)
    return 'Preventa finalizada';
  if (p.available < 1) return 'Agotado';
  return '';
}
export function productFamilies(products: Product[]) {
  const families = new Map<string, Product[]>();
  for (const product of products) {
    const key = `${product.kind}:${product.catalog_group || product.id}`;
    const family = families.get(key) || [];
    family.push(product);
    families.set(key, family);
  }
  return [...families.values()];
}
export function familyName(p: Product) {
  return p.catalog_name || p.name;
}
export function representative(products: Product[]) {
  return products.find((p) => !availability(p)) || products[0];
}
