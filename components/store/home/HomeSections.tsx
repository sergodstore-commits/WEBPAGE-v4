import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  CreditCard,
  MapPin,
  Store,
  Trophy,
  Truck,
} from 'lucide-react';
import type { Post, Settings } from '@/lib/types';
import styles from './HomeSections.module.css';

type Props = {
  settings: Settings;
  products: ReactNode;
  preorders: ReactNode;
  posts: Post[];
  postsState: ReactNode;
  renderPost: (post: Post) => ReactNode;
};

function SectionHeading({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <h2>{title}</h2>
      </div>
      <Link className={styles.textLink} href={href}>
        {action}
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </div>
  );
}

export default function HomeSections({
  settings,
  products,
  preorders,
  posts,
  postsState,
  renderPost,
}: Props) {
  const upcoming = posts
    .filter(
      (post) =>
        post.kind === 'tournament' &&
        post.event_at &&
        new Date(post.event_at).getTime() >= Date.now(),
    )
    .sort((a, b) => new Date(a.event_at!).getTime() - new Date(b.event_at!).getTime())
    .slice(0, 3);
  const editorial = posts.filter((post) => post.kind !== 'tournament').slice(0, 3);
  const enabledCarriers = settings.carriers.filter((carrier) => carrier.enabled);
  return (
    <div className={styles.homeSections}>
      <div className={styles.services} aria-label="Servicios de la tienda">
        <div>
          <Store size={24} aria-hidden="true" />
          <span>
            <strong>Retiro en tienda</strong>
          </span>
        </div>
        <div>
          <Truck size={24} aria-hidden="true" />
          <span>
            <strong>Envíos dentro de Chile</strong>
            <small>
              {enabledCarriers.length
                ? [...new Set(enabledCarriers.map((carrier) => carrier.name))].join(' · ')
                : 'Consulta las opciones al comprar'}
            </small>
          </span>
        </div>
        <div>
          <CreditCard size={24} aria-hidden="true" />
          <span>
            <strong>Pago online con Flow</strong>
          </span>
        </div>
      </div>

      <section className={styles.section} aria-label="Artículos de la tienda">
        <SectionHeading title="En la tienda" href="/tienda" action="Ver catálogo" />
        <div className={styles.catalog}>{products}</div>
      </section>

      <section className={styles.preorders} aria-label="Preventas publicadas">
        <div className={styles.section}>
          <SectionHeading
            title="Lo que viene a tu colección"
            href="/preventas"
            action="Ver preventas"
          />
          <p className={styles.intro}>
            Revisa las fechas, los cupos disponibles y las condiciones de entrega de cada reserva.
          </p>
          <div className={styles.catalog}>{preorders}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tournaments}`} aria-label="Próximos torneos">
        <div className={styles.tournamentIntro}>
          <Trophy size={36} strokeWidth={1.3} aria-hidden="true" />
          <h2>
            Tu próxima
            <br />
            partida en vivo.
          </h2>
          <Link className={styles.textLink} href="/torneos">
            Todos los torneos
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.events}>
          {postsState ||
            (upcoming.length ? (
              upcoming.map((post) => (
                <article className={styles.event} key={post.id}>
                  <time className={styles.date} dateTime={post.event_at!}>
                    <strong>
                      {new Intl.DateTimeFormat('es-CL', {
                        day: '2-digit',
                        timeZone: 'America/Santiago',
                      }).format(new Date(post.event_at!))}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat('es-CL', {
                        month: 'short',
                        timeZone: 'America/Santiago',
                      }).format(new Date(post.event_at!))}
                    </span>
                  </time>
                  <div>
                    <h3>
                      <Link href={`/publicacion/${post.slug}`}>{post.title}</Link>
                    </h3>
                    <p>
                      <CalendarDays size={14} aria-hidden="true" />
                      {new Intl.DateTimeFormat('es-CL', {
                        dateStyle: 'long',
                        timeStyle: 'short',
                        timeZone: 'America/Santiago',
                      }).format(new Date(post.event_at!))}
                    </p>
                    {post.location && (
                      <p>
                        <MapPin size={14} aria-hidden="true" />
                        {post.location}
                      </p>
                    )}
                  </div>
                  <Link
                    className={styles.eventLink}
                    href={`/publicacion/${post.slug}`}
                    aria-label={`Ver detalles: ${post.title}`}
                  >
                    <ArrowRight size={20} />
                  </Link>
                </article>
              ))
            ) : (
              <div className={styles.quietState}>
                <CalendarDays size={28} aria-hidden="true" />
                <h3>Nos preparamos para la próxima fecha</h3>
                <p>Las próximas fechas aparecerán aquí cuando la tienda las publique.</p>
              </div>
            ))}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.community}`}
        aria-label="Noticias y comunidad"
      >
        <SectionHeading title="Lo que nos reúne" href="/comunidad" action="Nuestra comunidad" />
        {postsState ||
          (editorial.length ? (
            <div className={styles.posts}>{editorial.map(renderPost)}</div>
          ) : (
            <div className={styles.quietState}>
              <h3>La conversación sigue en la tienda</h3>
              <p>Aquí podrás leer los anuncios y encuentros que publiquemos.</p>
            </div>
          ))}
        <Link className={styles.textLink} href="/noticias">
          Todas las noticias
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>

      {settings.address && (
        <section className={styles.visit} aria-label="Visita la tienda">
          <div className={styles.visitInner}>
            <div>
              <h2>
                La comunidad
                <br />
                tiene un lugar.
              </h2>
            </div>
            <div className={styles.visitDetails}>
              <p>
                <MapPin size={23} aria-hidden="true" />
                <strong>{settings.address}</strong>
              </p>
              {settings.hours && (
                <p>
                  <Clock3 size={20} aria-hidden="true" />
                  <span>{settings.hours}</span>
                </p>
              )}
              {settings.pickup_instructions && <p>{settings.pickup_instructions}</p>}
              <a
                className={styles.textLink}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address + ', Copiapó, Chile')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Cómo llegar
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
