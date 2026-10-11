'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Layers3, Search } from 'lucide-react';
import type { EditionChoice } from '@/lib/edition-gallery';
import { useRemote, Loading } from '../shared';
import EditionArticle from '../news/EditionArticle';
import styles from './EditionExplorer.module.css';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const releaseDay = (day: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));

export function EditionExplorer() {
  const remote = useRemote<EditionChoice[]>('/community/editions');
  const params = useSearchParams(),
    router = useRouter();
  const code = params.get('edicion');
  const [query, setQuery] = useState('');
  const selected = remote.data?.find((edition) => edition.code === code);
  const filtered = (remote.data || []).filter((edition) =>
    normalize(`${edition.name} ${edition.code}`).includes(normalize(query.trim())),
  );
  function href(edition?: string) {
    const next = new URLSearchParams(params.toString());
    next.set('vista', 'ediciones');
    if (edition) next.set('edicion', edition);
    else next.delete('edicion');
    return `/comunidad?${next}`;
  }
  return (
    <section className={styles.explorer} aria-labelledby="edition-explorer-title">
      <header className={styles.heading}>
        <span className={styles.icon}>
          <Layers3 size={25} aria-hidden="true" />
        </span>
        <div>
          <span className={styles.eyebrow}>BIBLIOTECA DEL DUELISTA · YU-GI-OH! TCG</span>
          <h2 id="edition-explorer-title">¿Qué cartas trae esta edición?</h2>
          <p>Elige una edición y descubre sus cartas, rarezas y efectos en español.</p>
        </div>
      </header>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div className={styles.message} role="alert">
          <p>No pudimos cargar las ediciones.</p>
          <button className="store-button store-button-secondary" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : code ? (
        selected ? (
          <>
            <div className={styles.selection}>
              <Link href={href()} scroll={false}>
                <ArrowLeft size={16} aria-hidden="true" /> Todas las ediciones
              </Link>
              <label>
                Cambiar edición
                <select
                  aria-label="Cambiar edición"
                  value={code}
                  onChange={(event) => router.push(href(event.target.value), { scroll: false })}
                >
                  {remote.data!.map((edition) => (
                    <option key={edition.code} value={edition.code}>
                      {edition.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <EditionArticle key={code} code={code === 'betb' ? undefined : code} explorer />
          </>
        ) : (
          <div className={styles.message} role="alert">
            <p>Esta edición no está disponible para consultar.</p>
            <Link className="store-button store-button-secondary" href={href()} scroll={false}>
              Ver ediciones disponibles
            </Link>
          </div>
        )
      ) : (
        <>
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar edición"
              placeholder="Nombre o código de la edición…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.grid}>
            {filtered.map((edition) => (
              <Link
                className={styles.edition}
                key={edition.code}
                href={href(edition.code)}
                scroll={false}
                aria-label={`Explorar ${edition.name}`}
              >
                <div className={styles.art} aria-hidden="true">
                  {edition.cover_cards.map((src, index) => (
                    <img
                      key={`${src}-${index}`}
                      src={src}
                      alt=""
                      width={220}
                      height={320}
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                  <span>{edition.code.toUpperCase()} · TCG</span>
                </div>
                <div className={styles.caption}>
                  <div className={styles.metadata}>
                    <span>{edition.total} cartas</span>
                    {edition.release_date && (
                      <time dateTime={edition.release_date}>
                        {releaseDay(edition.release_date)}
                      </time>
                    )}
                  </div>
                  <h3>{edition.name}</h3>
                  <span className={styles.action}>
                    Explorar edición <ArrowRight size={17} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {!filtered.length && <p role="status">No encontramos ediciones con esa búsqueda.</p>}
          <p className={styles.note}>
            Sobre, display y token box pueden compartir edición. La galería muestra las cartas que
            pueden aparecer; no garantiza el contenido de cada producto ni sus extras promocionales.
          </p>
        </>
      )}
    </section>
  );
}
