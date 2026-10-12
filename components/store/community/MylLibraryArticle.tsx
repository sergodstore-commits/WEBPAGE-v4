'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { X, Search, ArrowUpRight } from 'lucide-react';
import { useRemote, Loading } from '../shared';
import { EditionConnections } from '../catalog/EditionConnections';
import { editionExplorerPath } from '@/lib/edition-connections';
import { libraryFormats, type MylLibraryDocument, type MylLibraryCard } from '@/lib/myl-library';
import styles from '../news/EditionArticle.module.css';
import own from './MylLibraryArticle.module.css';

export function MylLibraryArticle({ code, preview = false }: { code: string; preview?: boolean }) {
  const params = useSearchParams(),
    router = useRouter();
  const remote = useRemote<MylLibraryDocument>(
    preview ? `/admin/news/myl-library/${code}/preview` : `/community/myl-library/${code}`,
  );
  const [query, setQuery] = useState(''),
    [role, setRole] = useState('main'),
    [limit, setLimit] = useState(48),
    [selected, setSelected] = useState<MylLibraryCard | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const doc = remote.data;
  const presentation = doc?.presentations.find((p) => p.id === params.get('presentacion'));
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const cards = (doc?.cards || []).filter(
    (c) =>
      (role === 'reserve' ? c.role === 'reserve' : c.role !== 'reserve') &&
      (role !== 'reserve' || !presentation || presentation.reserve.length > 0) &&
      (!presentation || !c.presentation || c.presentation === presentation.id) &&
      normalize(`${c.name} ${c.code} ${c.section}`).includes(normalize(query.trim())),
  );
  useEffect(() => {
    setLimit(48);
  }, [query, role, presentation?.id]);
  useEffect(() => {
    if (!selected || !dialog.current) return;
    const overflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [selected]);
  if (remote.loading) return <Loading />;
  if (remote.error || !doc)
    return (
      <div role="alert">
        <p>No pudimos cargar este contenido de MyL.</p>
        <button onClick={remote.reload}>Reintentar</button>
      </div>
    );
  const shown = doc.cards.filter((c) => c.role !== 'reserve').length;
  const expected =
    presentation && code === 'myl-ra'
      ? 12
      : presentation && code === 'myl-ultratumba'
        ? 24
        : doc.expected;
  const available = doc.cards.filter(
    (c) =>
      c.role !== 'reserve' &&
      (!presentation || !c.presentation || c.presentation === presentation.id),
  ).length;
  return (
    <article className={`${styles.article} ${styles.explorer}`}>
      <div className={styles.explorerHeading}>
        <div>
          <span className={styles.eyebrow}>{libraryFormats[doc.board]}</span>
          <h3>{doc.name}</h3>
        </div>
        <p>
          {shown} cartas disponibles en la fuente.{' '}
          {shown < doc.expected
            ? 'La revelación es parcial; faltan cartas por publicar en esta fuente.'
            : 'Incluye el listado de cartas disponible de la colección.'}
        </p>
      </div>
      <div className={own.presentation}>
        <label>
          Contenido del producto
          <select
            aria-label="Contenido del producto"
            value={presentation?.id || ''}
            onChange={(e) => {
              const next = new URLSearchParams(params.toString());
              if (e.target.value) next.set('presentacion', e.target.value);
              else next.delete('presentacion');
              router.push(`/comunidad?${next}`, { scroll: false });
            }}
            disabled={preview}
          >
            <option value="">Toda la colección</option>
            {doc.presentations.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {presentation ? (
          <div className={own.contents}>
            {(
              [
                ['Contenido fijo', presentation.fixed],
                ['Al azar', presentation.random],
                ['Promoción de reserva', presentation.reserve],
              ] as const
            )
              .filter(([, items]) => items.length)
              .map(([title, items]) => (
                <section key={title}>
                  <h4>{title}</h4>
                  <ul>
                    {items.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </section>
              ))}
            {presentation.pool && presentation.pool !== doc.code && (
              <Link className="store-text-link" href={editionExplorerPath(presentation.pool)}>
                Ver las cartas posibles de los sobres incluidos
              </Link>
            )}
          </div>
        ) : (
          <p>
            Elige una presentación para distinguir sus cartas fijas, sobres al azar y beneficios de
            reserva.
          </p>
        )}
      </div>
      {!preview && <EditionConnections code={code} explorer />}
      <section className={styles.catalog} aria-labelledby={`myl-gallery-${code}`}>
        <div className={`${styles.catalogHeading} ${own.galleryHeading}`}>
          <div>
            <span className={styles.eyebrow}>
              {role === 'reserve' ? 'BENEFICIOS CON CONDICIONES' : 'CONTENIDO VERIFICADO'}
            </span>
            <h2 id={`myl-gallery-${code}`}>
              {role === 'reserve' ? 'Promociones de reserva' : 'Cartas del producto'}
            </h2>
          </div>
          <span role="status">
            {available} de {expected} cartas mostradas por la fuente
          </span>
        </div>
        <div className={styles.filters}>
          <label>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar carta MyL"
              placeholder="Nombre, código o frecuencia…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Tipo de contenido MyL"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="main">Cartas del producto</option>
            <option value="reserve">Promociones de reserva</option>
          </select>
        </div>
        <p className={own.notice}>
          {role === 'reserve'
            ? 'Estas cartas son beneficios de reserva; no forman parte de todos los productos ni de sus sobres.'
            : 'Pulsa una carta para ampliar la imagen y leer su habilidad en español. Si la fuente no publica el nombre como texto, se conserva su código de referencia.'}
        </p>
        <p role="status" className={own.notice}>
          {cards.length} resultados{cards.length > limit ? ` · mostrando ${limit}` : ''}
        </p>
        <div className={styles.grid}>
          {cards.slice(0, limit).map((card) => (
            <button
              className={styles.card}
              key={card.code}
              onClick={() => setSelected(card)}
              aria-label={`Ver carta MyL: ${card.name}`}
            >
              <img
                src={card.thumbnail || card.image}
                alt={card.name}
                width={220}
                height={320}
                loading="lazy"
                decoding="async"
              />
              <span className={`${styles.code} ${own.reference}`}>{card.code}</span>
              <strong>{card.name}</strong>
              <small>
                {card.section ||
                  (card.role === 'reserve' ? 'Reserva' : presentation?.name || doc.name)}
              </small>
            </button>
          ))}
        </div>
        {!cards.length && <p>No encontramos cartas con esos filtros.</p>}
        {cards.length > limit && (
          <button
            className="store-button store-button-secondary"
            onClick={() => setLimit((n) => n + 48)}
          >
            Ver más cartas
          </button>
        )}
      </section>
      <footer className={styles.sources}>
        <strong>Fuente oficial y cobertura</strong>
        <p>
          <a href={doc.source} target="_blank" rel="noopener noreferrer">
            Blog oficial Mitos y Leyendas
          </a>
          . Consulta revisada el {doc.updated}. Las imágenes conservan el texto original en español.
          La galería no cambia la habilidad impresa ni sustituye las reglas y erratas vigentes.
        </p>
      </footer>
      {selected && (
        <dialog
          ref={dialog}
          className={`${styles.dialog} ${own.dialog}`}
          aria-labelledby="myl-card-title"
          onCancel={() => setSelected(null)}
          onClose={() => setSelected(null)}
        >
          <button
            className={styles.close}
            aria-label="Cerrar carta MyL"
            onClick={() => setSelected(null)}
            autoFocus
          >
            <X size={22} />
          </button>
          <h2 id="myl-card-title">{selected.name}</h2>
          <p>
            {selected.code} ·{' '}
            {selected.role === 'reserve' ? 'Promoción de reserva' : 'Carta del producto'}
          </p>
          <img
            className={own.cardImage}
            src={selected.image}
            alt={selected.name}
            width={700}
            height={1000}
          />
          <p>Habilidad en español en la imagen oficial de la carta.</p>
          <a href={doc.source} target="_blank" rel="noopener noreferrer">
            Consultar la fuente <ArrowUpRight size={15} />
          </a>
        </dialog>
      )}
    </article>
  );
}
