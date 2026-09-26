'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  ImagePlus,
  LayoutDashboard,
  Menu,
  Newspaper,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { api, date, deliveryLabels, money, paymentLabels, price } from '@/lib/client';
import type { Carrier, Dashboard, Order, Post, Product, Settings, User } from '@/lib/types';
import './admin.css';

type Notice = { text: string; kind: 'success' | 'error' } | null;
const productStatus: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  withdrawn: 'Retirado',
};
const kindLabel: Record<string, string> = {
  store: 'Tienda',
  preorder: 'Preventa',
  news: 'Noticia',
  community: 'Comunidad',
  tournament: 'Torneo',
};
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación. Intenta otra vez.';
}
function Feedback({ notice }: { notice: Notice }) {
  return notice ? (
    <div
      className={`admin-feedback ${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {notice.kind === 'success' && <Check size={17} />}
      <span>{notice.text}</span>
    </div>
  ) : null;
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="admin-empty">
      <Package size={30} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Tag({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return <span className={`admin-tag ${good ? 'good' : ''}`}>{children}</span>;
}
function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, load, setData };
}
function Loading({ error, retry }: { error?: string; retry?: () => void }) {
  return error ? (
    <div className="admin-feedback error" role="alert">
      <span>{error}</span>
      {retry && (
        <button className="admin-button secondary" onClick={retry}>
          Reintentar
        </button>
      )}
    </div>
  ) : (
    <div className="admin-loading" role="status">
      Cargando información…
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

const navigation = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/articulos', label: 'Artículos', icon: ShoppingBag },
  { href: '/admin/inventario', label: 'Inventario', icon: Package },
  { href: '/admin/preventas', label: 'Preventas', icon: ClipboardList },
  { href: '/admin/pedidos', label: 'Pedidos y entregas', icon: Truck },
  { href: '/admin/pos', label: 'Venta en el local', icon: CreditCard },
  { href: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/local', label: 'Datos del local', icon: SettingsIcon },
];

export default function AdminApp() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [menu, setMenu] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    api<User | null>('/auth/me')
      .then(setUser)
      .catch((e) => setAuthError(errorText(e)))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  if (checking)
    return (
      <div className="admin-shell admin-auth">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <div className="admin-shell admin-auth">
        <AdminLogin onLogin={setUser} initialError={authError} />
      </div>
    );
  if (user.role !== 'admin')
    return (
      <div className="admin-shell admin-auth">
        <div className="admin-auth-card">
          <Store size={30} />
          <h1>Acceso de administración</h1>
          <p>
            Tu cuenta tiene acceso a la tienda. Para administrar necesitas una cuenta autorizada.
          </p>
          <Link className="admin-button" href="/cuenta">
            Ir a mi cuenta
          </Link>
          <Link className="admin-text-link" href="/">
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  let screen: ReactNode;
  if (pathname === '/admin') screen = <DashboardPage />;
  else if (pathname === '/admin/articulos/nuevo') screen = <ProductEditor />;
  else if (pathname.startsWith('/admin/articulos/'))
    screen = <ProductEditor productId={pathname.split('/')[3]} />;
  else if (pathname === '/admin/articulos') screen = <ProductsPage />;
  else if (pathname === '/admin/preventas') screen = <ProductsPage preorders />;
  else if (pathname === '/admin/inventario') screen = <InventoryPage />;
  else if (pathname.startsWith('/admin/pedidos/'))
    screen = <OrderPage id={pathname.split('/')[3]} />;
  else if (pathname === '/admin/pedidos') screen = <OrdersPage />;
  else if (pathname === '/admin/pos') screen = <PosPage />;
  else if (pathname === '/admin/publicaciones') screen = <PostsPage />;
  else if (pathname === '/admin/clientes') screen = <CustomersPage />;
  else if (pathname === '/admin/local') screen = <SettingsPage />;
  else if (pathname === '/admin/correos') screen = <MailPage />;
  else
    screen = (
      <Empty title="Esta sección no existe">
        <Link href="/admin">Volver al resumen</Link>
      </Empty>
    );
  return (
    <div className="admin-shell">
      {menu && (
        <button
          className="admin-sidebar-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`admin-sidebar ${menu ? 'open' : ''}`}>
        <Link href="/admin" className="admin-brand">
          <span className="admin-brand-mark">S</span>
          <span>
            SERGOD STORE<small>Administración</small>
          </span>
        </Link>
        <Link className="admin-button admin-new" href="/admin/articulos/nuevo">
          <Plus size={17} />
          Nuevo artículo
        </Link>
        <nav aria-label="Administración">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'))
                  ? 'active'
                  : ''
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" className="admin-store-link">
            <ExternalLink size={16} />
            Ver tienda pública
          </Link>
          <div className="admin-user">
            <span className="admin-avatar">{user.name?.charAt(0).toUpperCase() || 'A'}</span>
            <div>
              <strong>{user.name || 'Administrador'}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="admin-icon-button admin-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <span>
            Administración <ChevronRight size={14} />{' '}
            {navigation.find((n) => n.href !== '/admin' && pathname.startsWith(n.href))?.label ||
              'Resumen'}
          </span>
          <Link href="/" className="admin-top-public">
            Visitar tienda <ExternalLink size={14} />
          </Link>
        </header>
        <main className="admin-main">{screen}</main>
        <footer className="admin-footer">SERGOD STORE · Copiapó, Chile</footer>
      </div>
    </div>
  );
}

function AdminLogin({
  onLogin,
  initialError,
}: {
  onLogin: (u: User) => void;
  initialError: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(
    initialError ? { kind: 'error', text: initialError } : null,
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onLogin(result);
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-auth-card">
      <Link href="/" className="admin-brand">
        <span className="admin-brand-mark">S</span>
        <span>SERGOD STORE</span>
      </Link>
      <p className="admin-eyebrow">Administración</p>
      <h1>Ingresa a tu panel</h1>
      <p>Usa tu cuenta de administrador para gestionar la tienda.</p>
      <Feedback notice={notice} />
      <form onSubmit={submit}>
        <Field label="Correo electrónico">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button className="admin-button" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <Link className="admin-text-link" href="/cuenta">
        Recuperar contraseña o acceder a mi cuenta
      </Link>
    </div>
  );
}

function DashboardPage() {
  const r = useResource<Dashboard & { development?: boolean }>('/admin/dashboard');
  if (!r.data) return <Loading error={r.error} retry={r.load} />;
  const d = r.data;
  return (
    <>
      <Heading
        eyebrow="Tu tienda, en un lugar"
        title="Resumen"
        description="Revisa las ventas y continúa con las tareas del día."
      >
        <Link className="admin-button" href="/admin/articulos/nuevo">
          <Plus size={17} />
          Nuevo artículo
        </Link>
      </Heading>
      <div className="admin-stat-grid">
        {[
          { label: 'Artículos', value: d.products, icon: Package },
          { label: 'Pedidos', value: d.orders, icon: ShoppingBag },
          { label: 'Pagos pendientes', value: d.pending, icon: ClipboardList },
          { label: 'Ventas aprobadas', value: money(d.revenue), icon: CreditCard },
        ].map(({ label, value, icon: Icon }) => (
          <div className="admin-stat" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-card">
          <div className="admin-card-heading">
            <h2>Últimos pedidos</h2>
            <Link href="/admin/pedidos">
              Ver todos <ChevronRight size={14} />
            </Link>
          </div>
          {d.recent_orders.length ? (
            <OrderTable orders={d.recent_orders} />
          ) : (
            <Empty title="Aún no hay pedidos">
              Las compras de la web y del local aparecerán aquí.
            </Empty>
          )}
        </section>
        <section className="admin-card">
          <div className="admin-card-heading">
            <h2>Tareas de la tienda</h2>
          </div>
          <div className="admin-shortcuts">
            <Link href="/admin/inventario">
              <Package size={20} />
              <span>
                <strong>Revisar inventario</strong>
                <small>
                  {d.low_stock
                    ? `${d.low_stock} artículos con pocas unidades`
                    : 'Consulta y ajusta el stock compartido'}
                </small>
              </span>
              <ChevronRight size={16} />
            </Link>
            <Link href="/admin/pos">
              <CreditCard size={20} />
              <span>
                <strong>Registrar una venta</strong>
                <small>Atiende una compra en el local</small>
              </span>
              <ChevronRight size={16} />
            </Link>
            <Link href="/admin/publicaciones">
              <Newspaper size={20} />
              <span>
                <strong>Compartir una novedad</strong>
                <small>Noticias, comunidad y torneos</small>
              </span>
              <ChevronRight size={16} />
            </Link>
            <Link href="/admin/local">
              <Store size={20} />
              <span>
                <strong>Configurar el local</strong>
                <small>Retiro, transportistas y horarios</small>
              </span>
              <ChevronRight size={16} />
            </Link>
            {d.development && (
              <Link href="/admin/correos">
                <span>
                  <strong>Correos de prueba</strong>
                  <small>Solo en desarrollo local</small>
                </span>
                <ChevronRight size={16} />
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ProductsPage({ preorders = false }: { preorders?: boolean }) {
  const r = useResource<Product[]>('/admin/products');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState('');
  const products = (r.data || []).filter(
    (p) =>
      (!preorders || p.kind === 'preorder') &&
      (status === 'all' || p.status === status) &&
      [p.name, p.sku, p.category].some((s) => s.toLowerCase().includes(query.toLowerCase())),
  );
  async function action(p: Product, remove: boolean) {
    if (
      !window.confirm(
        remove
          ? `¿Borrar “${p.name}”? Dejará de aparecer en la tienda. Las ventas anteriores conservarán su información.`
          : `¿Retirar “${p.name}” de la tienda? Podrás editarlo y publicarlo nuevamente.`,
      )
    )
      return;
    setBusy(p.id);
    setNotice(null);
    try {
      await api(`/admin/products/${p.id}${remove ? '' : '/withdraw'}`, {
        method: remove ? 'DELETE' : 'POST',
        ...(!remove ? { body: '{}' } : {}),
      });
      setNotice({
        kind: 'success',
        text: remove
          ? 'Artículo borrado. El historial de ventas se conserva.'
          : 'Artículo retirado de la tienda.',
      });
      await r.load();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <Heading
        title={preorders ? 'Preventas' : 'Artículos'}
        description={
          preorders
            ? 'Gestiona las fechas, cupos y condiciones de tus reservas.'
            : 'Crea, publica y actualiza los artículos de la tienda.'
        }
      >
        <Link
          className="admin-button"
          href={`/admin/articulos/nuevo${preorders ? '?tipo=preventa' : ''}`}
        >
          <Plus size={17} />
          {preorders ? 'Nueva preventa' : 'Nuevo artículo'}
        </Link>
      </Heading>
      <Feedback notice={notice} />
      <section className="admin-card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={17} />
            <input
              aria-label="Buscar artículos"
              placeholder="Buscar por nombre, SKU o categoría"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Estado de publicación"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="published">Publicados</option>
            <option value="draft">Borradores</option>
            <option value="withdrawn">Retirados</option>
          </select>
          <span className="admin-count">{products.length} artículos</span>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : products.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Destino</th>
                  <th>Precio</th>
                  <th>Disponibles</th>
                  <th>Estado</th>
                  <th>
                    <span className="admin-sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="admin-product-cell" href={`/admin/articulos/${p.id}`}>
                        <Thumbnail url={p.images[0]} name={p.name} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.sku} · {p.category}
                          </small>
                          {preorders && <small>Cierre: {date(p.closes_at)}</small>}
                        </span>
                      </Link>
                    </td>
                    <td>{kindLabel[p.kind]}</td>
                    <td>
                      <strong>{money(price(p))}</strong>
                      {p.discount_percent > 0 && (
                        <small className="admin-original-price">
                          {money(p.price)} · −{p.discount_percent}%
                        </small>
                      )}
                    </td>
                    <td>
                      {p.available}
                      <small className="admin-muted">{p.reserved} reservadas</small>
                    </td>
                    <td>
                      <Tag good={p.status === 'published'}>{productStatus[p.status]}</Tag>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Link href={`/admin/articulos/${p.id}`}>Editar</Link>
                        {p.status === 'published' && (
                          <button disabled={busy === p.id} onClick={() => action(p, false)}>
                            Retirar
                          </button>
                        )}
                        <button
                          disabled={busy === p.id}
                          onClick={() => action(p, true)}
                          aria-label={`Borrar ${p.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              query || status !== 'all'
                ? 'No hay coincidencias'
                : preorders
                  ? 'Aún no hay preventas'
                  : 'Aún no hay artículos'
            }
          >
            {query || status !== 'all'
              ? 'Prueba otra búsqueda o cambia los filtros.'
              : 'Usa «Nuevo artículo» para cargar tu primer producto.'}
          </Empty>
        )}
      </section>
    </>
  );
}
function Thumbnail({ url, name }: { url?: string; name: string }) {
  return (
    <span className="admin-thumbnail">
      {url ? <img src={url} alt={name} /> : <Package size={22} />}
    </span>
  );
}
type ProductForm = {
  name: string;
  description: string;
  sku: string;
  price: string;
  category: string;
  stock: string;
  discount_percent: string;
  kind: 'store' | 'preorder';
  images: string[];
  opens_at: string;
  closes_at: string;
  max_per_customer: string;
  delivery_terms: string;
};
const blankProduct: ProductForm = {
  name: '',
  description: '',
  sku: '',
  price: '',
  category: '',
  stock: '0',
  discount_percent: '0',
  kind: 'store',
  images: [],
  opens_at: '',
  closes_at: '',
  max_per_customer: '1',
  delivery_terms: '',
};
function localDate(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function toProductForm(p: Product): ProductForm {
  return {
    name: p.name,
    description: p.description,
    sku: p.sku,
    price: String(p.price),
    category: p.category,
    stock: String(p.stock),
    discount_percent: String(p.discount_percent),
    kind: p.kind,
    images: p.images,
    opens_at: localDate(p.opens_at),
    closes_at: localDate(p.closes_at),
    max_per_customer: String(p.max_per_customer || 1),
    delivery_terms: p.delivery_terms,
  };
}
function ProductEditor({ productId }: { productId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<ProductForm>(blankProduct);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(!!productId);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    let active = true;
    if (productId && product?.id === productId) {
      setLoading(false);
      return;
    }
    setNotice(null);
    if (!productId) {
      setProduct(null);
      setForm({
        ...blankProduct,
        kind:
          new URLSearchParams(window.location.search).get('tipo') === 'preventa'
            ? 'preorder'
            : 'store',
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Product>('/admin/products/' + productId)
      .then((p) => {
        if (active) {
          setProduct(p);
          setForm(toProductForm(p));
        }
      })
      .catch((e) => {
        if (active) setNotice({ kind: 'error', text: errorText(e) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (form.images.length + files.length > 8) {
      setNotice({ kind: 'error', text: 'Puedes guardar hasta 8 imágenes por artículo.' });
      return;
    }
    if (Array.from(files).some((file) => file.size > 4 * 1024 * 1024)) {
      setNotice({ kind: 'error', text: 'Cada imagen debe pesar como máximo 4 MB.' });
      return;
    }
    setUploading(true);
    setNotice(null);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        const result = await api<{ url: string }>('/admin/uploads', { method: 'POST', body });
        setForm((f) => ({ ...f, images: [...f.images, result.url] }));
      }
      setNotice({
        kind: 'success',
        text: 'Imágenes cargadas. Guarda el artículo para conservar su orden y portada.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function save(publish: boolean) {
    setBusy(true);
    setNotice(null);
    setConfirmPublish(false);
    try {
      const payload = {
        ...form,
        price: Number(form.price || 0),
        stock: Number(form.stock),
        discount_percent: Number(form.discount_percent),
        opens_at:
          form.kind === 'preorder' && form.opens_at ? new Date(form.opens_at).toISOString() : null,
        closes_at:
          form.kind === 'preorder' && form.closes_at
            ? new Date(form.closes_at).toISOString()
            : null,
        max_per_customer: form.kind === 'preorder' ? Number(form.max_per_customer) : null,
        ...(!product ? { status: 'draft' } : { expected_version: product.version }),
      };
      const saved = await api<Product>(
        product ? `/admin/products/${product.id}` : '/admin/products',
        { method: product ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      setProduct(saved);
      let completed = saved;
      if (publish) {
        completed = await api<Product>(`/admin/products/${saved.id}/publish`, {
          method: 'POST',
          body: '{}',
        });
        setProduct(completed);
        const first = await api<Product>(`/products/${completed.slug}`);
        const persisted = await api<Product>(`/products/${completed.slug}`);
        const section = await api<Product[]>(`/products?kind=${completed.kind}`);
        if (
          !section.some((p) => p.id === completed.id) ||
          first.id !== completed.id ||
          persisted.id !== completed.id ||
          persisted.kind !== form.kind ||
          persisted.status !== 'published'
        )
          throw new Error(
            'El artículo se guardó, pero no pudimos comprobar su publicación. Revisa el listado antes de volver a publicar.',
          );
        setNotice({
          kind: 'success',
          text: `Artículo publicado en ${kindLabel[completed.kind]}. Comprobamos que se puede consultar como cliente y volver a cargar desde el servidor.`,
        });
      } else
        setNotice({
          kind: 'success',
          text:
            saved.status === 'published'
              ? 'Cambios guardados. El artículo publicado fue actualizado.'
              : 'Borrador guardado. Puedes continuar editándolo antes de publicar.',
        });
      setForm(toProductForm(completed));
      if (!productId) router.replace(`/admin/articulos/${completed.id}`);
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!product || !window.confirm(`¿Retirar “${product.name}” de la tienda pública?`)) return;
    setBusy(true);
    try {
      const p = await api<Product>(`/admin/products/${product.id}/withdraw`, {
        method: 'POST',
        body: '{}',
      });
      setProduct(p);
      setNotice({
        kind: 'success',
        text: 'Artículo retirado. Ya no está disponible para nuevas compras.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (productId && !product && notice?.kind === 'error')
    return (
      <>
        <Link className="admin-back" href="/admin/articulos">
          <ArrowLeft size={16} />
          Artículos
        </Link>
        <Feedback notice={notice} />
      </>
    );
  return (
    <>
      <Link className="admin-back" href="/admin/articulos">
        <ArrowLeft size={16} />
        Artículos
      </Link>
      <Heading
        title={product ? 'Editar artículo' : 'Nuevo artículo'}
        description="Completa la información, carga las imágenes y revisa antes de publicar."
      >
        <div className="admin-actions">
          {product && (
            <Tag good={product.status === 'published'}>{productStatus[product.status]}</Tag>
          )}
          <button className="admin-button secondary" onClick={() => setPreview(!preview)}>
            {preview ? 'Cerrar vista previa' : 'Vista previa'}
          </button>
        </div>
      </Heading>
      <Feedback notice={notice} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="admin-editor-layout">
          <div className="admin-form-sections">
            <section className="admin-card admin-card-body">
              <h2>
                <span className="admin-step">1</span>Información del artículo
              </h2>
              <div className="admin-form-grid">
                <Field label="Nombre *">
                  <input
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    required
                    maxLength={160}
                    placeholder="Nombre del producto"
                  />
                </Field>
                <Field
                  label="SKU *"
                  hint="Código único para buscar el artículo y registrar ventas."
                >
                  <input
                    value={form.sku}
                    onChange={(e) => update('sku', e.target.value)}
                    required
                    maxLength={80}
                    placeholder="Ej. YGO-001"
                  />
                </Field>
                <Field label="Categoría *">
                  <input
                    value={form.category}
                    onChange={(e) => update('category', e.target.value)}
                    required
                    maxLength={80}
                    placeholder="Ej. Yu-Gi-Oh!"
                  />
                </Field>
                <Field label="Dónde se mostrará">
                  <select
                    value={form.kind}
                    onChange={(e) => update('kind', e.target.value as ProductForm['kind'])}
                  >
                    <option value="store">Tienda</option>
                    <option value="preorder">Preventas</option>
                  </select>
                </Field>
                <div className="admin-span-all">
                  <Field label="Descripción *">
                    <textarea
                      rows={6}
                      value={form.description}
                      onChange={(e) => update('description', e.target.value)}
                      required
                      placeholder="Explica qué incluye el producto y sus características."
                    />
                  </Field>
                </div>
              </div>
            </section>
            <section className="admin-card admin-card-body">
              <h2>
                <span className="admin-step">2</span>Imágenes
              </h2>
              <p className="admin-section-description">
                La primera imagen es la portada. Puedes elegir otra antes de guardar.
              </p>
              <div className="admin-upload-area">
                <ImagePlus size={25} />
                <div>
                  <strong>
                    {uploading ? 'Cargando imágenes…' : 'Agrega fotografías del artículo'}
                  </strong>
                  <span>JPG, PNG o WebP. Máximo 8 imágenes, 4 MB cada una.</span>
                </div>
                <button
                  className="admin-button secondary"
                  type="button"
                  disabled={uploading || busy}
                  onClick={() => fileInput.current?.click()}
                >
                  Seleccionar imágenes
                </button>
                <input
                  ref={fileInput}
                  className="admin-sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => void upload(e.target.files)}
                  aria-label="Imágenes del artículo"
                />
              </div>
              {form.images.length > 0 && (
                <div className="admin-image-grid">
                  {form.images.map((image, i) => (
                    <div className="admin-image-tile" key={`${image}-${i}`}>
                      <img src={image} alt={`Imagen ${i + 1} del artículo`} />
                      {i === 0 && <span className="admin-cover-tag">Portada</span>}
                      <div>
                        <button
                          type="button"
                          disabled={i === 0 || busy}
                          onClick={() =>
                            update('images', [image, ...form.images.filter((_, n) => n !== i)])
                          }
                        >
                          <ArrowUp size={14} />
                          Portada
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            update(
                              'images',
                              form.images.filter((_, n) => n !== i),
                            )
                          }
                          aria-label={`Quitar imagen ${i + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="admin-card admin-card-body">
              <h2>
                <span className="admin-step">3</span>Precio e inventario
              </h2>
              <div className="admin-form-grid three">
                <Field label="Precio en pesos chilenos *">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.price}
                    onChange={(e) => update('price', e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label={form.kind === 'preorder' ? 'Cupos totales *' : 'Unidades en stock *'}
                  hint={
                    product
                      ? `${product.reserved} unidades reservadas en pedidos pendientes.`
                      : 'El stock se comparte con las ventas del local.'
                  }
                >
                  <input
                    type="number"
                    min={product?.reserved || 0}
                    step="1"
                    value={form.stock}
                    onChange={(e) => update('stock', e.target.value)}
                    required
                  />
                </Field>
                <Field label="Descuento (%)">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={form.discount_percent}
                    onChange={(e) => update('discount_percent', e.target.value)}
                  />
                </Field>
              </div>
              <div className="admin-price-summary">
                <span>Precio final para el cliente</span>
                <strong>
                  {money(
                    Math.round((Number(form.price) * (100 - Number(form.discount_percent))) / 100),
                  )}
                </strong>
              </div>
            </section>
            {form.kind === 'preorder' && (
              <section className="admin-card admin-card-body">
                <h2>
                  <span className="admin-step">4</span>Condiciones de la preventa
                </h2>
                <div className="admin-form-grid">
                  <Field label="Apertura de reservas *">
                    <input
                      type="datetime-local"
                      value={form.opens_at}
                      onChange={(e) => update('opens_at', e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Cierre de reservas *">
                    <input
                      type="datetime-local"
                      value={form.closes_at}
                      onChange={(e) => update('closes_at', e.target.value)}
                      min={form.opens_at}
                      required
                    />
                  </Field>
                  <Field label="Máximo de unidades por cliente *">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.max_per_customer}
                      onChange={(e) => update('max_per_customer', e.target.value)}
                      required
                    />
                  </Field>
                  <p className="admin-help">
                    Las fechas usan la zona horaria de este dispositivo. Los cupos se comprueban al
                    reservar.
                  </p>
                  <div className="admin-span-all">
                    <Field label="Condiciones y fecha estimada de entrega *">
                      <textarea
                        rows={4}
                        value={form.delivery_terms}
                        onChange={(e) => update('delivery_terms', e.target.value)}
                        required
                        placeholder="Indica cuándo y cómo se entregará, y cualquier condición relevante."
                      />
                    </Field>
                  </div>
                </div>
              </section>
            )}
          </div>
          <aside className="admin-editor-aside">
            <section className="admin-card admin-card-body">
              <p className="admin-eyebrow">{preview ? 'Vista previa' : 'Resumen del artículo'}</p>
              <div className="admin-preview-image">
                {form.images[0] ? (
                  <img src={form.images[0]} alt={form.name || 'Portada del artículo'} />
                ) : (
                  <ImagePlus size={36} />
                )}
              </div>
              <Tag>{kindLabel[form.kind]}</Tag>
              <h2 className="admin-preview-name">{form.name || 'Nombre del artículo'}</h2>
              <p className="admin-preview-price">
                {money(
                  Math.round((Number(form.price) * (100 - Number(form.discount_percent))) / 100),
                )}
              </p>
              <p className="admin-muted">
                {form.category || 'Sin categoría'} · {form.stock || 0} unidades
              </p>
              {preview && (
                <>
                  <p className="admin-preview-description">
                    {form.description || 'La descripción aparecerá aquí.'}
                  </p>
                  {form.kind === 'preorder' && <p>{form.delivery_terms}</p>}
                </>
              )}
              <hr />
              <p className="admin-help">
                Para publicar se necesita nombre, SKU, descripción, categoría, una imagen, precio y
                stock válidos.
              </p>
              {product?.status === 'published' && (
                <Link
                  className="admin-button secondary full"
                  href={`/producto/${product.slug}`}
                  target="_blank"
                >
                  Ver como cliente <ExternalLink size={15} />
                </Link>
              )}
            </section>
          </aside>
        </div>
        <div className="admin-save-bar">
          <p>
            {product
              ? `Última actualización: ${date(product.updated_at)}`
              : 'Guarda un borrador para continuar después.'}
          </p>
          <div className="admin-actions">
            {product?.status === 'published' && (
              <button
                type="button"
                className="admin-button secondary"
                disabled={busy || uploading}
                onClick={withdraw}
              >
                Retirar
              </button>
            )}
            <button
              className="admin-button secondary"
              formNoValidate={product?.status !== 'published'}
              disabled={busy || uploading}
            >
              {busy
                ? 'Guardando…'
                : product?.status === 'published'
                  ? 'Guardar cambios'
                  : 'Guardar borrador'}
            </button>
            <button
              type="button"
              className="admin-button"
              disabled={busy || uploading}
              onClick={() => setConfirmPublish(true)}
            >
              {product?.status === 'published' ? 'Guardar y verificar' : 'Publicar artículo'}
            </button>
          </div>
        </div>
      </form>
      {confirmPublish && (
        <div className="admin-modal-overlay">
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
          >
            <button
              className="admin-icon-button admin-modal-close"
              onClick={() => setConfirmPublish(false)}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
            <h2 id="publish-title">
              {product?.status === 'published'
                ? 'Actualizar artículo publicado'
                : 'Publicar artículo'}
            </h2>
            <p>
              «{form.name || 'Artículo sin nombre'}» aparecerá en {kindLabel[form.kind]}. El
              servidor revisará los requisitos antes de publicarlo.
            </p>
            <p>Después comprobaremos que el artículo se puede consultar en la tienda.</p>
            <div className="admin-actions">
              <button className="admin-button secondary" onClick={() => setConfirmPublish(false)}>
                Seguir editando
              </button>
              <button className="admin-button" onClick={() => void save(true)}>
                Confirmar publicación
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function InventoryPage() {
  const r = useResource<Product[]>('/admin/products');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  async function adjust(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      await api('/admin/inventory', {
        method: 'POST',
        body: JSON.stringify({ product_id: selected.id, delta: Number(delta), reason }),
      });
      setNotice({ kind: 'success', text: `Inventario de “${selected.name}” actualizado.` });
      setSelected(null);
      setDelta('');
      setReason('');
      await r.load();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  const products = (r.data || []).filter((p) =>
    [p.name, p.sku].some((s) => s.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <>
      <Heading
        title="Inventario"
        description="Un solo stock para la web y las ventas en el local."
      />
      <Feedback notice={notice} />
      <section className="admin-card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar inventario"
              placeholder="Buscar por nombre o SKU"
            />
          </div>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : products.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Stock total</th>
                  <th>Reservado</th>
                  <th>Disponible</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="admin-product-cell">
                        <Thumbnail url={p.images[0]} name={p.name} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.sku}</small>
                        </span>
                      </div>
                    </td>
                    <td>{p.stock}</td>
                    <td>{p.reserved}</td>
                    <td>
                      <strong>{p.available}</strong>
                    </td>
                    <td>
                      <button
                        className="admin-button secondary compact"
                        onClick={() => {
                          setSelected(p);
                          setDelta('');
                          setReason('');
                        }}
                      >
                        Ajustar stock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay artículos para mostrar" />
        )}
      </section>
      {selected && (
        <div className="admin-modal-overlay">
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-title"
          >
            <button
              className="admin-icon-button admin-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
            <h2 id="inventory-title">Ajustar inventario</h2>
            <Feedback notice={notice?.kind === 'error' ? notice : null} />
            <p>
              {selected.name} · {selected.available} disponibles
            </p>
            <form onSubmit={adjust}>
              <Field
                label="Cantidad a agregar o descontar"
                hint="Usa un número positivo para ingresar unidades y negativo para descontarlas."
              >
                <input
                  type="number"
                  step="1"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  required
                />
              </Field>
              <Field label="Motivo del ajuste">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="Ej. Llegada de mercadería, corrección de conteo…"
                />
              </Field>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-button secondary"
                  onClick={() => setSelected(null)}
                >
                  Cancelar
                </button>
                <button className="admin-button" disabled={busy || Number(delta) === 0}>
                  {busy ? 'Guardando…' : 'Confirmar ajuste'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

function OrderTable({ orders }: { orders: Order[] }) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Pago</th>
            <th>Entrega</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link className="admin-order-link" href={`/admin/pedidos/${o.id}`}>
                  #{o.number}
                </Link>
                <small className="admin-muted">{date(o.created_at)}</small>
              </td>
              <td>
                <strong>{o.customer_name || 'Cliente del local'}</strong>
                <small className="admin-muted">
                  {o.source === 'pos' ? 'Venta presencial' : o.customer_email}
                </small>
              </td>
              <td>{money(o.total)}</td>
              <td>
                <Tag good={o.payment_status === 'approved'}>{paymentLabels[o.payment_status]}</Tag>
                {o.payment_environment === 'sandbox' && <Tag>Prueba sandbox</Tag>}
              </td>
              <td>{deliveryLabels[o.fulfillment_status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function OrdersPage() {
  const r = useResource<Order[]>('/admin/orders');
  const [query, setQuery] = useState('');
  const [payment, setPayment] = useState('all');
  const [source, setSource] = useState('all');
  const filtered = (r.data || []).filter(
    (o) =>
      (payment === 'all' || o.payment_status === payment) &&
      (source === 'all' || o.source === source) &&
      `${o.number} ${o.customer_name} ${o.customer_email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="Pedidos y entregas"
        description="Consulta los pagos, prepara pedidos y registra sus entregas."
      />
      <section className="admin-card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={17} />
            <input
              aria-label="Buscar pedidos"
              placeholder="Buscar pedido o cliente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Estado del pago"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            <option value="all">Todos los pagos</option>
            {Object.entries(paymentLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Origen de la venta"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">Web y local</option>
            <option value="web">Tienda web</option>
            <option value="pos">Local físico</option>
          </select>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : filtered.length ? (
          <OrderTable orders={filtered} />
        ) : (
          <Empty title="No hay pedidos para mostrar">
            Los pedidos aparecerán después de una compra.
          </Empty>
        )}
      </section>
    </>
  );
}
function OrderPage({ id }: { id: string }) {
  const r = useResource<Order>(`/admin/orders/${id}`);
  const [fulfillment, setFulfillment] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    if (r.data) {
      setFulfillment(r.data.fulfillment_status);
      setCarrier(r.data.carrier || '');
      setTracking(r.data.tracking || '');
    }
  }, [r.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const updated = await api<Order>(`/admin/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fulfillment_status: fulfillment, carrier, tracking }),
      });
      r.setData(updated);
      setNotice({
        kind: 'success',
        text: 'Preparación y entrega actualizadas. El cliente puede consultar los cambios en su cuenta.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setNotice(null);
    try {
      await api(`/admin/orders/${id}/refresh`, { method: 'POST', body: '{}' });
      await r.load();
      setNotice({ kind: 'success', text: 'Estado del pago consultado directamente con Flow.' });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  if (!r.data) return <Loading error={r.error} retry={r.load} />;
  const o = r.data;
  const deliveryNames: Record<string, string> = {
    type: 'Modalidad',
    method: 'Modalidad',
    carrier: 'Transportista',
    carrier_name: 'Transportista',
    name: 'Destinatario',
    recipient: 'Destinatario',
    recipient_name: 'Destinatario',
    phone: 'Teléfono',
    region: 'Región',
    commune: 'Comuna',
    address: 'Dirección',
    agency: 'Agencia',
    notes: 'Indicaciones',
    collect: 'Envío por pagar',
    mode: 'Destino',
    shipping_price: 'Costo de envío',
    hours: 'Horario',
    instructions: 'Instrucciones',
    freight_note: 'Flete',
  };
  return (
    <>
      <Link className="admin-back" href="/admin/pedidos">
        <ArrowLeft size={16} />
        Pedidos
      </Link>
      <Heading
        title={`Pedido #${o.number}`}
        description={`${date(o.created_at)} · ${o.source === 'pos' ? 'Venta en el local' : 'Compra en la web'}${o.payment_environment === 'sandbox' ? ' · Prueba sandbox, sin cobro real' : ''}`}
      >
        <Tag good={o.payment_status === 'approved'}>{paymentLabels[o.payment_status]}</Tag>
      </Heading>
      <Feedback notice={notice} />
      <div className="admin-order-layout">
        <div className="admin-form-sections">
          <section className="admin-card">
            <div className="admin-card-heading">
              <h2>Artículos del pedido</h2>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Unidades</th>
                    <th>Precio</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((item, i) => (
                    <tr key={`${item.product_id}-${i}`}>
                      <td>
                        <div className="admin-product-cell">
                          <Thumbnail url={item.image} name={item.name} />
                          <span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.sku}
                              {item.kind === 'preorder' ? ' · Preventa' : ''}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unit_price)}</td>
                      <td>{money(item.unit_price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-totals">
              <p>
                <span>Productos</span>
                <span>{money(o.subtotal)}</span>
              </p>
              <p>
                <span>Envío incluido en el pago</span>
                <span>{money(o.shipping_price)}</span>
              </p>
              <p className="total">
                <span>Total</span>
                <strong>{money(o.total)}</strong>
              </p>
              {o.cash_received !== null && (
                <>
                  <p>
                    <span>Efectivo recibido</span>
                    <span>{money(o.cash_received)}</span>
                  </p>
                  <p>
                    <span>Cambio</span>
                    <span>{money(o.change_amount || 0)}</span>
                  </p>
                </>
              )}
              {o.delivery.collect === true && (
                <small>El cliente paga el flete al transportista por separado.</small>
              )}
            </div>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Historial del pedido</h2>
            {o.events?.length ? (
              <ol className="admin-timeline">
                {o.events.map((event) => (
                  <li key={event.id}>
                    <span />
                    <div>
                      <p>{event.message}</p>
                      <small>{date(event.created_at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="admin-muted">Sin movimientos adicionales.</p>
            )}
          </section>
        </div>
        <div className="admin-form-sections">
          <section className="admin-card admin-card-body">
            <h2>Cliente y entrega</h2>
            <strong>{o.customer_name || 'Cliente del local'}</strong>
            {o.customer_email && <p>{o.customer_email}</p>}
            <dl className="admin-details">
              {Object.entries(o.delivery || {})
                .filter(([k, v]) => v !== '' && v !== null && !['carrier_id', 'price'].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{deliveryNames[k] || k}</dt>
                    <dd>
                      {typeof v === 'boolean'
                        ? v
                          ? 'Sí'
                          : 'No'
                        : v === 'pickup'
                          ? 'Retiro en local'
                          : v === 'shipping'
                            ? 'Envío'
                            : v === 'address'
                              ? 'Domicilio'
                              : v === 'agency'
                                ? 'Agencia'
                                : v === 'pos'
                                  ? 'Venta en el local'
                                  : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Preparación y seguimiento</h2>
            <form onSubmit={save}>
              <Field label="Estado de la entrega">
                <select
                  disabled={o.payment_status !== 'approved' || !o.can_manage_delivery}
                  value={fulfillment}
                  onChange={(e) => setFulfillment(e.target.value)}
                >
                  {Object.entries(deliveryLabels)
                    .filter(
                      ([k]) =>
                        k !== 'cancelled' &&
                        (o.delivery.method !== 'pickup' || k !== 'shipped') &&
                        (o.delivery.method !== 'shipping' || k !== 'ready'),
                    )
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Transportista">
                <input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="Nombre del transportista"
                />
              </Field>
              <Field label="Número de seguimiento">
                <input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Número o código de envío"
                />
              </Field>
              {o.payment_status !== 'approved' && (
                <p className="admin-help">
                  La preparación se habilita cuando el pago está aprobado.
                </p>
              )}
              <button
                className="admin-button full"
                disabled={busy || o.payment_status !== 'approved' || !o.can_manage_delivery}
              >
                {busy ? 'Guardando…' : 'Guardar entrega'}
              </button>
            </form>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Pago</h2>
            {o.payment_environment === 'sandbox' && (
              <p className="admin-help">
                Prueba sandbox, sin cobro real. No se incluye en las ventas comerciales.
              </p>
            )}
            <p>
              {paymentLabels[o.payment_status]} ·{' '}
              {o.payment_method === 'flow'
                ? 'Flow'
                : (
                    {
                      cash: 'Efectivo',
                      card: 'Tarjeta en el local',
                      transfer: 'Transferencia',
                      other: 'Otro medio',
                    } as Record<string, string>
                  )[o.payment_method] || o.payment_method}
            </p>
            {o.expires_at && o.payment_status === 'pending' && (
              <p className="admin-help">Unidades reservadas hasta {date(o.expires_at)}.</p>
            )}
            {o.can_refresh_payment && (
              <button className="admin-button secondary full" disabled={busy} onClick={refresh}>
                Consultar pago en Flow
              </button>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

const emptyPost = {
  title: '',
  body: '',
  kind: 'news' as Post['kind'],
  status: 'draft' as Post['status'],
  image: '',
  event_at: '',
  location: '',
};
function PostsPage() {
  const r = useResource<Post[]>('/admin/posts');
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState(emptyPost);
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function edit(p?: Post) {
    setEditing(p?.id || null);
    setForm(
      p
        ? {
            title: p.title,
            body: p.body,
            kind: p.kind,
            status: p.status,
            image: p.image,
            event_at: localDate(p.event_at),
            location: p.location,
          }
        : { ...emptyPost },
    );
    setNotice(null);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<Post>(editing ? `/admin/posts/${editing}` : '/admin/posts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          event_at: form.event_at ? new Date(form.event_at).toISOString() : null,
        }),
      });
      setEditing(result.id);
      setNotice({
        kind: 'success',
        text:
          result.status === 'published'
            ? 'Publicación guardada y visible para la comunidad.'
            : 'Publicación guardada.',
      });
      await r.load();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(p: Post) {
    if (!window.confirm(`¿Borrar “${p.title}”? Esta publicación dejará de estar disponible.`))
      return;
    try {
      await api(`/admin/posts/${p.id}`, { method: 'DELETE' });
      if (editing === p.id) setEditing(undefined);
      setNotice({ kind: 'success', text: 'Publicación borrada.' });
      await r.load();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await api<{ url: string }>('/admin/uploads', { method: 'POST', body });
      setForm((f) => ({ ...f, image: result.url }));
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }
  const posts = (r.data || []).filter((p) => filter === 'all' || p.kind === filter);
  return (
    <>
      <Heading
        title="Publicaciones"
        description="Comparte noticias, información de la comunidad y próximos torneos."
      >
        <button className="admin-button" onClick={() => edit()}>
          <Plus size={17} />
          Nueva publicación
        </button>
      </Heading>
      <Feedback notice={notice} />
      {editing !== undefined && (
        <section className="admin-card admin-card-body admin-post-editor">
          <div className="admin-card-heading plain">
            <h2>{editing ? 'Editar publicación' : 'Nueva publicación'}</h2>
            <button
              className="admin-icon-button"
              onClick={() => setEditing(undefined)}
              aria-label="Cerrar editor"
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={save}>
            <div className="admin-form-grid">
              <Field label="Título *">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  maxLength={180}
                />
              </Field>
              <Field label="Sección">
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as Post['kind'] })}
                >
                  <option value="news">Noticias</option>
                  <option value="community">Comunidad</option>
                  <option value="tournament">Torneos</option>
                </select>
              </Field>
              <div className="admin-span-all">
                <Field label="Contenido *">
                  <textarea
                    rows={7}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    required
                    placeholder="Escribe los detalles que verá la comunidad."
                  />
                </Field>
              </div>
              <Field
                label={
                  form.kind === 'tournament'
                    ? 'Fecha y hora del torneo *'
                    : 'Fecha y hora del evento (opcional)'
                }
              >
                <input
                  type="datetime-local"
                  value={form.event_at}
                  onChange={(e) => setForm({ ...form, event_at: e.target.value })}
                  required={form.kind === 'tournament'}
                />
              </Field>
              <Field label={form.kind === 'tournament' ? 'Lugar del torneo *' : 'Lugar (opcional)'}>
                <input
                  required={form.kind === 'tournament'}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Field>
              <Field label="Estado">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Post['status'] })}
                >
                  <option value="draft">Borrador</option>
                  <option value="published">Publicado</option>
                  <option value="withdrawn">Retirado</option>
                </select>
              </Field>
              <div className="admin-field">
                <span>Imagen</span>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="admin-button secondary"
                    disabled={uploading}
                    onClick={() => input.current?.click()}
                  >
                    <ImagePlus size={17} />
                    {uploading ? 'Cargando…' : 'Cargar imagen'}
                  </button>
                  {form.image && (
                    <button
                      type="button"
                      className="admin-button secondary"
                      onClick={() => setForm({ ...form, image: '' })}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="admin-sr-only"
                  onChange={(e) => void upload(e.target.files?.[0])}
                  aria-label="Imagen de la publicación"
                />
              </div>
              {form.image && (
                <img
                  className="admin-post-preview"
                  src={form.image}
                  alt="Imagen de la publicación"
                />
              )}
            </div>
            <div className="admin-actions end">
              <button
                type="button"
                className="admin-button secondary"
                onClick={() => setEditing(undefined)}
              >
                Cerrar
              </button>
              <button className="admin-button" disabled={busy || uploading}>
                {busy
                  ? 'Guardando…'
                  : form.status === 'published'
                    ? 'Guardar y publicar'
                    : 'Guardar publicación'}
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="admin-card">
        <div className="admin-toolbar">
          <select
            aria-label="Filtrar publicaciones"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas las secciones</option>
            <option value="news">Noticias</option>
            <option value="community">Comunidad</option>
            <option value="tournament">Torneos</option>
          </select>
          <span className="admin-count">{posts.length} publicaciones</span>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : posts.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Publicación</th>
                  <th>Sección</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <small className="admin-muted">{date(p.event_at || p.created_at)}</small>
                    </td>
                    <td>{kindLabel[p.kind]}</td>
                    <td>
                      <Tag good={p.status === 'published'}>{productStatus[p.status]}</Tag>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button onClick={() => edit(p)}>Editar</button>
                        {p.status === 'published' && (
                          <Link href={`/publicacion/${p.slug}`} target="_blank">
                            Ver <ExternalLink size={13} />
                          </Link>
                        )}
                        <button onClick={() => void remove(p)} aria-label={`Borrar ${p.title}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Aún no hay publicaciones">
            La página de inicio mostrará la información que publiques aquí.
          </Empty>
        )}
      </section>
    </>
  );
}

function CustomersPage() {
  const r = useResource<User[]>('/admin/customers');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<User | null>(null);
  const customers = (r.data || []).filter((c) =>
    `${c.name} ${c.email} ${c.konami_id} ${c.klu_code}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="Clientes"
        description="Consulta los datos de las cuentas y sus identificadores para torneos."
      />
      <section className="admin-card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={17} />
            <input
              aria-label="Buscar clientes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nombre, correo, Konami ID o KLU"
            />
          </div>
          <span className="admin-count">{customers.length} clientes</span>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : customers.length ? (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Konami ID / KLU</th>
                  <th>Cuenta</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name || 'Sin nombre'}</strong>
                      <small className="admin-muted">Desde {date(c.created_at)}</small>
                    </td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      {c.konami_id || '—'}
                      <small className="admin-muted">KLU: {c.klu_code || '—'}</small>
                    </td>
                    <td>
                      <Tag good={c.email_verified}>
                        {c.email_verified ? 'Verificada' : 'Correo por verificar'}
                      </Tag>
                    </td>
                    <td>
                      <button
                        className="admin-button secondary compact"
                        onClick={() => setSelected(c)}
                      >
                        Ver datos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay clientes para mostrar" />
        )}
      </section>
      {selected && (
        <div className="admin-modal-overlay">
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-title"
          >
            <button
              className="admin-icon-button admin-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
            <h2 id="customer-title">{selected.name || 'Cliente'}</h2>
            <dl className="admin-details">
              <div>
                <dt>Correo</dt>
                <dd>{selected.email}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{selected.phone || 'No indicado'}</dd>
              </div>
              <div>
                <dt>Konami ID</dt>
                <dd>{selected.konami_id || 'No indicado'}</dd>
              </div>
              <div>
                <dt>Código KLU</dt>
                <dd>{selected.klu_code || 'No indicado'}</dd>
              </div>
              {Object.entries(selected.address || {}).map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {(
                      {
                        address: 'Dirección',
                        commune: 'Comuna',
                        region: 'Región',
                        agency: 'Agencia',
                        recipient: 'Destinatario',
                        phone: 'Teléfono',
                        notes: 'Indicaciones',
                        delivery_preference: 'Preferencia de entrega',
                      } as Record<string, string>
                    )[k] || k}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </>
  );
}

function SettingsPage() {
  const r = useResource<Settings>('/settings');
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    if (r.data) setForm(r.data);
  }, [r.data]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  function carrier(index: number, changes: Partial<Carrier>) {
    if (form)
      update(
        'carriers',
        form.carriers.map((c, i) => (i === index ? { ...c, ...changes } : c)),
      );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api<Settings>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      const read = await api<Settings>('/settings');
      setForm(read);
      r.setData(saved);
      setNotice({
        kind: 'success',
        text: 'Configuración guardada y comprobada. La tienda y el checkout ya usan estos datos.',
      });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  if (!form) return <Loading error={r.error} retry={r.load} />;
  return (
    <>
      <Heading
        title="Datos del local"
        description="Actualiza la información de la tienda y las opciones de entrega."
      />
      <Feedback notice={notice} />
      <form onSubmit={save}>
        <div className="admin-form-sections">
          <section className="admin-card admin-card-body">
            <h2>Información pública</h2>
            <div className="admin-form-grid">
              <Field label="Nombre del local *">
                <input
                  value={form.name}
                  required
                  onChange={(e) => update('name', e.target.value)}
                />
              </Field>
              <Field label="Correo de contacto">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </Field>
              <Field label="Dirección del local">
                <input
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="Calle, número, Copiapó"
                />
              </Field>
              <div className="admin-span-all">
                <Field label="Presentación de la tienda">
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => update('description', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Horario de atención">
                <textarea
                  rows={3}
                  value={form.hours}
                  onChange={(e) => update('hours', e.target.value)}
                  placeholder="Indica días y horarios."
                />
              </Field>
              <Field label="Instrucciones para retiro">
                <textarea
                  rows={3}
                  value={form.pickup_instructions}
                  onChange={(e) => update('pickup_instructions', e.target.value)}
                  placeholder="Explica cuándo retirar y qué debe presentar el cliente."
                />
              </Field>
            </div>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Reservas durante el pago</h2>
            <div className="admin-form-grid">
              <Field
                label="Tiempo de reserva (minutos)"
                hint="Las unidades de una compra pendiente se reservan durante este plazo y se liberan si no se completa."
              >
                <input
                  type="number"
                  min="5"
                  max="120"
                  step="1"
                  required
                  value={form.reservation_minutes}
                  onChange={(e) => update('reservation_minutes', Number(e.target.value))}
                />
              </Field>
            </div>
          </section>
          <section className="admin-card admin-card-body">
            <div className="admin-card-heading plain">
              <div>
                <h2>Transportistas y modalidades</h2>
                <p className="admin-help">
                  Cada modalidad habilitada aparece como una opción de envío.
                </p>
              </div>
              <button
                type="button"
                className="admin-button secondary"
                onClick={() =>
                  update('carriers', [
                    ...form.carriers,
                    {
                      id: crypto.randomUUID(),
                      name: '',
                      enabled: true,
                      mode: 'address',
                      collect: true,
                      price: 0,
                    },
                  ])
                }
              >
                <Plus size={16} />
                Agregar opción
              </button>
            </div>
            {form.carriers.length === 0 ? (
              <p className="admin-help">
                No hay transportistas configurados. Los clientes podrán elegir retiro en el local.
              </p>
            ) : (
              form.carriers.map((c, i) => (
                <div className="admin-carrier" key={c.id}>
                  <div className="admin-form-grid three">
                    <Field label="Transportista *">
                      <input
                        value={c.name}
                        onChange={(e) => carrier(i, { name: e.target.value })}
                        required
                        placeholder="Nombre del transportista"
                      />
                    </Field>
                    <Field label="Modalidad">
                      <select
                        value={c.mode}
                        onChange={(e) => carrier(i, { mode: e.target.value as Carrier['mode'] })}
                      >
                        <option value="address">Envío a domicilio</option>
                        <option value="agency">Retiro en agencia</option>
                      </select>
                    </Field>
                    <Field label="Costo incluido en la compra (CLP)">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required={!c.collect}
                        disabled={c.collect}
                        value={c.collect ? 0 : c.price}
                        onChange={(e) => carrier(i, { price: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                  <div className="admin-carrier-options">
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        onChange={(e) => carrier(i, { enabled: e.target.checked })}
                      />
                      Habilitado
                    </label>
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={c.collect}
                        onChange={(e) =>
                          carrier(i, {
                            collect: e.target.checked,
                            ...(e.target.checked ? { price: 0 } : {}),
                          })
                        }
                      />
                      Envío por pagar al recibir
                    </label>
                    <button
                      type="button"
                      className="admin-text-button"
                      onClick={() => {
                        if (
                          window.confirm(
                            '¿Quitar esta opción de envío? Los pedidos anteriores conservarán sus datos.',
                          )
                        )
                          update(
                            'carriers',
                            form.carriers.filter((_, n) => n !== i),
                          );
                      }}
                    >
                      <Trash2 size={16} />
                      Quitar
                    </button>
                  </div>
                  {c.collect && (
                    <p className="admin-help">
                      El transportista cobrará el flete por separado. No se suma al total pagado en
                      Flow.
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
        <div className="admin-save-bar">
          <p>Los cambios se aplican al guardar.</p>
          <button className="admin-button" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </>
  );
}

function PosPage() {
  const r = useResource<Product[]>('/admin/products');
  const [query, setQuery] = useState('');
  const [ticket, setTicket] = useState<{ product: Product; quantity: number }[]>([]);
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const transaction = useRef({ signature: '', key: '' });
  const total = ticket.reduce((sum, line) => sum + price(line.product) * line.quantity, 0);
  const matches = (r.data || []).filter(
    (p) =>
      p.kind === 'store' &&
      p.status === 'published' &&
      [p.name, p.sku].some((s) => s.toLowerCase().includes(query.toLowerCase())),
  );
  function add(p: Product) {
    const line = ticket.find((l) => l.product.id === p.id);
    if ((line?.quantity || 0) >= p.available) {
      setNotice({
        kind: 'error',
        text: `Solo hay ${p.available} unidades disponibles de ${p.name}.`,
      });
      return;
    }
    setTicket((t) =>
      line
        ? t.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...t, { product: p, quantity: 1 }],
    );
    setReceipt(null);
    setNotice(null);
  }
  async function sell(e: FormEvent) {
    e.preventDefault();
    if (!ticket.length) return;
    setBusy(true);
    setNotice(null);
    const payload = {
      items: ticket.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      payment_method: method,
      ...(method === 'cash' ? { cash_received: Number(received) } : {}),
      customer_name: customer,
    };
    const signature = JSON.stringify(payload);
    if (transaction.current.signature !== signature)
      transaction.current = { signature, key: crypto.randomUUID() };
    try {
      const order = await api<Order>('/admin/pos', {
        method: 'POST',
        body: JSON.stringify({ ...payload, idempotency_key: transaction.current.key }),
      });
      setReceipt(order);
      setTicket([]);
      setReceived('');
      setCustomer('');
      transaction.current = { signature: '', key: '' };
      setNotice({
        kind: 'success',
        text: `Venta #${order.number} registrada. El inventario fue actualizado.`,
      });
      await r.load();
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Venta en el local"
        description="Registra el pago recibido y descuenta las unidades del inventario compartido."
      />
      <Feedback notice={notice} />
      {receipt && (
        <section className="admin-card admin-card-body admin-receipt">
          <Check size={25} />
          <div>
            <h2>Venta #{receipt.number} completada</h2>
            <p>
              {money(receipt.total)} · {date(receipt.created_at)}
              {receipt.change_amount !== null ? ` · Cambio: ${money(receipt.change_amount)}` : ''}
            </p>
          </div>
          <Link className="admin-button secondary" href={`/admin/pedidos/${receipt.id}`}>
            Consultar venta
          </Link>
        </section>
      )}
      <div className="admin-pos-layout">
        <section className="admin-card">
          <div className="admin-toolbar">
            <div className="admin-search">
              <Search size={17} />
              <input
                aria-label="Buscar artículos para venta"
                placeholder="Buscar por nombre o SKU"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {r.loading ? (
            <Loading />
          ) : r.error ? (
            <Loading error={r.error} retry={r.load} />
          ) : matches.length ? (
            <div className="admin-pos-products">
              {matches.map((p) => (
                <button
                  className="admin-pos-product"
                  key={p.id}
                  disabled={p.available < 1 || busy}
                  onClick={() => add(p)}
                >
                  <Thumbnail url={p.images[0]} name={p.name} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sku} · {p.available} disponibles
                    </small>
                    <b>{money(price(p))}</b>
                  </span>
                  <Plus size={17} />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="No hay artículos para vender">
              Busca otro nombre o crea artículos para la tienda.
            </Empty>
          )}
        </section>
        <section className="admin-card admin-card-body admin-ticket">
          <div className="admin-card-heading plain">
            <h2>Ticket de venta</h2>
            <Tag>{ticket.reduce((s, l) => s + l.quantity, 0)} unidades</Tag>
          </div>
          <form onSubmit={sell}>
            {ticket.length ? (
              <div className="admin-ticket-items">
                {ticket.map((line) => (
                  <div className="admin-ticket-item" key={line.product.id}>
                    <div>
                      <strong>{line.product.name}</strong>
                      <small>{money(price(line.product))} por unidad</small>
                      <div className="admin-quantity">
                        <button
                          type="button"
                          disabled={busy || line.quantity <= 1}
                          onClick={() =>
                            setTicket((t) =>
                              t.map((l) =>
                                l.product.id === line.product.id
                                  ? { ...l, quantity: l.quantity - 1 }
                                  : l,
                              ),
                            )
                          }
                          aria-label={`Reducir cantidad de ${line.product.name}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          aria-label={`Cantidad de ${line.product.name}`}
                          min="1"
                          max={line.product.available}
                          step="1"
                          value={line.quantity}
                          disabled={busy}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isInteger(n) && n >= 1 && n <= line.product.available)
                              setTicket((t) =>
                                t.map((l) =>
                                  l.product.id === line.product.id ? { ...l, quantity: n } : l,
                                ),
                              );
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy || line.quantity >= line.product.available}
                          onClick={() => add(line.product)}
                          aria-label={`Aumentar cantidad de ${line.product.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <strong>{money(price(line.product) * line.quantity)}</strong>
                      <button
                        type="button"
                        className="admin-icon-button"
                        disabled={busy}
                        onClick={() =>
                          setTicket((t) => t.filter((l) => l.product.id !== line.product.id))
                        }
                        aria-label={`Quitar ${line.product.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-ticket-empty">
                Selecciona artículos del listado para comenzar una venta.
              </p>
            )}
            <div className="admin-ticket-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <Field label="Nombre del cliente (opcional)">
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Medio de pago recibido">
              <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta en el local</option>
                <option value="transfer">Transferencia</option>
                <option value="other">Otro medio</option>
              </select>
            </Field>
            {method === 'cash' && (
              <>
                <Field label="Dinero recibido (CLP)">
                  <input
                    type="number"
                    step="1"
                    min={total}
                    value={received}
                    required
                    onChange={(e) => setReceived(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <div className="admin-change">
                  <span>Cambio</span>
                  <strong>{money(Math.max(0, Number(received) - total))}</strong>
                </div>
              </>
            )}
            <p className="admin-help">
              Confirma la venta cuando hayas recibido el pago en el local.
            </p>
            <button
              className="admin-button full"
              disabled={
                busy || ticket.length === 0 || (method === 'cash' && Number(received) < total)
              }
            >
              {busy ? 'Registrando venta…' : 'Completar venta'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function MailPage() {
  const r = useResource<
    {
      id: string;
      recipient: string;
      subject: string;
      body: string;
      status: string;
      created_at: string;
    }[]
  >('/admin/mail');
  return (
    <>
      <Heading
        title="Correos de prueba"
        description="Bandeja de desarrollo local. Estos correos permiten comprobar los flujos sin enviarlos a un buzón real."
      />
      <section className="admin-card">
        <div className="admin-toolbar">
          <button className="admin-button secondary" onClick={r.load}>
            Actualizar
          </button>
        </div>
        {r.loading ? (
          <Loading />
        ) : r.error ? (
          <Loading error={r.error} retry={r.load} />
        ) : r.data?.length ? (
          <div className="admin-mail-list">
            {r.data.map((m) => (
              <details key={m.id}>
                <summary>
                  <strong>{m.subject}</strong>
                  <span>
                    {m.recipient} · {date(m.created_at)}
                  </span>
                </summary>
                <p className="admin-mail-body">{m.body}</p>
                <small>{m.status}</small>
              </details>
            ))}
          </div>
        ) : (
          <Empty title="Aún no hay correos de prueba">
            Los mensajes de verificación, recuperación y pedidos aparecerán aquí.
          </Empty>
        )}
      </section>
    </>
  );
}
