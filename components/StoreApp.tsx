'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { StoreHeader } from '@/components/store/StoreHeader';
import { StoreFooter } from '@/components/store/StoreFooter';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  HeartHandshake,
  MapPin,
  Newspaper,
  Package,
  Trophy,
  X,
} from 'lucide-react';
import { api, date, deliveryLabels, money, paymentLabels, price } from '@/lib/client';
import type { CartItem, Order, Post, Product, Settings, User } from '@/lib/types';
import {
  useRemote,
  Loading,
  Empty,
  PageIntro,
  RemoteError,
  ProductImage,
  availability,
} from './store/shared';
import { Cart, Account, OrderDetail } from './store/commerce/Commerce';
import { Community } from './store/community/Community';
import { News } from './store/news/News';
import { Catalog } from './store/catalog/Catalog';
import { ProductDetail } from './store/product/ProductDetail';
import { Tournaments, TournamentDetail } from './store/tournaments/Tournaments';
import './store.css';
import '@/styles/store-foundation.css';
import '@/styles/store-interior.css';

const HomeHero = dynamic(() => import('@/components/store/home/HomeHero'));
const EditionArticle = dynamic(() => import('@/components/store/news/EditionArticle'));
const WebNewsArticle = dynamic(() => import('@/components/store/news/WebNewsArticle'));

const CART_KEY = 'sergod-store-cart-v1';
const emptySettings: Settings = {
  name: 'SERGOD STORE',
  description: '',
  address: '',
  hours: '',
  pickup_instructions: '',
  phone: '',
  email: '',
  reservation_minutes: 20,
  carriers: [],
};
function PostCard({ post: p }: { post: Post }) {
  const href = p.slug.startsWith('instagram-')
    ? `/noticias?publicacion=${p.id}`
    : `/publicacion/${p.slug}`;
  return (
    <article className="store-post-card">
      <Link href={href}>
        <ProductImage src={p.image} name={p.title} className="store-post-image" />
      </Link>
      <div className="store-post-card-content">
        <span className="store-eyebrow">
          {p.kind === 'news' ? 'Noticias' : p.kind === 'community' ? 'Comunidad' : 'Torneos'}
        </span>
        <h3>
          <Link href={href}>{p.title}</Link>
        </h3>
        <p>
          {p.body.slice(0, 145)}
          {p.body.length > 145 ? '…' : ''}
        </p>
        <div className="store-post-meta">
          <CalendarDays size={15} />
          {date(p.event_at || p.created_at)}
        </div>
        <Link className="store-text-link" href={href}>
          Leer más <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

export default function StoreApp({ pathname: pathnameProp }: { pathname?: string } = {}) {
  const livePath = usePathname(),
    pathname = pathnameProp || livePath || '/',
    router = useRouter();
  const [settings, setSettings] = useState<Settings>(emptySettings),
    [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [cart, setCart] = useState<CartItem[]>([]),
    [cartReady, setCartReady] = useState(false),
    [toast, setToast] = useState('');
  const refreshUser = useCallback(async () => {
    try {
      setUser(await api<User | null>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }, []);
  useEffect(() => {
    api<Settings>('/settings')
      .then(setSettings)
      .catch(() => {});
    refreshUser();
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (x: CartItem) =>
                x &&
                typeof x.product_id === 'string' &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0,
            )
            .map((x: CartItem) => ({
              product_id: x.product_id,
              quantity: Math.min(100, x.quantity),
            })),
        );
    } catch {}
    setCartReady(true);
  }, [refreshUser]);
  useEffect(() => {
    if (cartReady) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, cartReady]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  function add(p: Product, n = 1) {
    const existing = cart.find((i) => i.product_id === p.id)?.quantity || 0,
      limit = Math.min(
        100,
        p.available,
        p.kind === 'preorder' && p.max_per_customer ? p.max_per_customer : 100,
      );
    if (availability(p)) {
      const message = availability(p);
      setToast(message);
      return { success: false, message };
    }
    if (existing + n > limit) {
      const message = `Puedes añadir hasta ${limit} unidades de este artículo.`;
      setToast(message);
      return { success: false, message };
    }
    setCart((current) => {
      const found = current.find((i) => i.product_id === p.id);
      return found
        ? current.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + n } : i))
        : [...current, { product_id: p.id, quantity: n }];
    });
    const message = `${p.name} se añadió al carrito.`;
    setToast(message);
    return { success: true, message };
  }
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  let content: ReactNode;
  if (pathname === '/') content = <HomeHero description={settings.description} />;
  else if (pathname === '/tienda' || pathname === '/preventas')
    content = (
      <Catalog key={pathname} kind={pathname === '/tienda' ? 'store' : 'preorder'} add={add} />
    );
  else if (pathname.startsWith('/producto/'))
    content = <ProductDetail slug={pathname.split('/')[2]} add={add} />;
  else if (pathname === '/torneos') content = <Tournaments />;
  else if (pathname === '/comunidad') content = <Community />;
  else if (pathname === '/noticias/beyond-the-brave') content = <EditionArticle />;
  else if (/^\/noticias\/ediciones\/[a-z0-9-]+$/.test(pathname))
    content = <EditionArticle key={pathname} code={pathname.split('/')[3]} />;
  else if (pathname === '/noticias') content = <News />;
  else if (/^\/noticias\/tcg\/[a-zA-Z0-9-]+$/.test(pathname))
    content = <WebNewsArticle key={pathname} id={pathname.split('/')[3]} />;
  else if (['/noticias', '/comunidad'].includes(pathname))
    content = (
      <Posts
        key={pathname}
        kind={
          pathname === '/noticias' ? 'news' : pathname === '/comunidad' ? 'community' : 'tournament'
        }
      />
    );
  else if (pathname.startsWith('/publicacion/'))
    content = <PostDetail slug={pathname.split('/')[2]} />;
  else if (pathname === '/carrito')
    content = (
      <Cart
        cart={cart}
        setCart={setCart}
        settings={settings}
        user={user}
        ready={authReady && cartReady}
      />
    );
  else if (pathname.startsWith('/cuenta/pedidos/') || pathname.startsWith('/pedido/'))
    content = (
      <OrderDetail
        id={pathname.split('/').filter(Boolean).at(-1) || ''}
        user={user}
        ready={authReady}
        cart={cart}
        setCart={setCart}
      />
    );
  else if (pathname.startsWith('/cuenta'))
    content = (
      <Account pathname={pathname} user={user} ready={authReady} refreshUser={refreshUser} />
    );
  else
    content = (
      <Empty
        title="No encontramos esta página"
        body="Puedes volver al inicio o explorar los artículos disponibles."
      >
        <Link href="/" className="store-button">
          Volver al inicio
        </Link>
      </Empty>
    );
  return (
    <div className={pathname === '/' ? 'store-app store-cover' : 'store-app store-interior'}>
      <StoreHeader
        pathname={pathname}
        user={user}
        count={count}
        paymentMode={settings.payment_mode}
      />
      <main
        className={pathname === '/' ? 'store-main store-home-main' : 'store-main'}
        id="contenido"
        tabIndex={-1}
      >
        {content}
      </main>
      {pathname !== '/' && <StoreFooter settings={settings} />}
      {toast && (
        <div className="store-toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function Posts({ kind }: { kind: 'news' | 'community' | 'tournament' }) {
  const remote = useRemote<Post[]>(`/posts?kind=${kind}`),
    title = kind === 'news' ? 'Noticias' : kind === 'community' ? 'Comunidad' : 'Torneos';
  return (
    <div className="store-page">
      <PageIntro
        eyebrow="LA VIDA EN SERGOD STORE"
        title={title}
        body={
          kind === 'news'
            ? 'Novedades y anuncios publicados por la tienda.'
            : kind === 'community'
              ? 'Un lugar para encontrarnos alrededor de las cartas.'
              : 'Fechas, formatos e información para tu próxima partida.'
        }
      />
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} reload={remote.reload} />
      ) : remote.data?.length ? (
        <div className="store-post-grid">
          {remote.data.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <Empty
          icon={
            kind === 'tournament' ? (
              <Trophy size={30} />
            ) : kind === 'community' ? (
              <HeartHandshake size={30} />
            ) : (
              <Newspaper size={30} />
            )
          }
          title="Pronto habrá novedades"
          body={`Las publicaciones de ${title.toLowerCase()} aparecerán aquí cuando la tienda las publique.`}
        />
      )}
    </div>
  );
}
function PostDetail({ slug }: { slug: string }) {
  const remote = useRemote<Post>(`/posts/${encodeURIComponent(slug)}`);
  if (remote.loading) return <Loading />;
  if (remote.error)
    return (
      <div className="store-page">
        <RemoteError error={remote.error} reload={remote.reload} />
      </div>
    );
  const p = remote.data;
  if (!p) return null;
  if (p.kind === 'tournament') return <TournamentDetail post={p} />;
  const section = p.kind === 'news' ? '/noticias' : '/comunidad';
  return (
    <article className="store-page store-article">
      <Link className="store-text-link" href={section}>
        <ArrowLeft size={16} />
        Volver a {section.slice(1)}
      </Link>
      <PageIntro eyebrow={p.kind === 'news' ? 'NOTICIAS' : 'COMUNIDAD'} title={p.title} />
      <div className="store-article-meta">
        <span>
          <CalendarDays size={17} />
          {date(p.event_at || p.created_at)}
        </span>
        {p.location && (
          <span>
            <MapPin size={17} />
            {p.location}
          </span>
        )}
      </div>
      {p.image && <ProductImage src={p.image} name={p.title} className="store-article-image" />}
      <div className="store-article-body store-preline">{p.body}</div>
    </article>
  );
}
