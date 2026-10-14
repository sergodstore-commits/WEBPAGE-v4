'use client';
import { useState } from 'react';
import { ArrowRight, BookOpen, Search, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  localWebArticle,
  newsBoards,
  type NewsBoard,
  webNewsCategories,
  type WebNewsItem,
  type WebNewsCategory,
} from '@/lib/web-news';
import { useRemote, Loading } from '../shared';
import styles from './News.module.css';

export function WebNewsCover({ item }: { item: WebNewsItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.newsCover} data-category={item.category || 'news'}>
      {item.image && !failed ? (
        <img src={item.image} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : item.cover_cards?.length ? (
        <div className={styles.coverCards} aria-hidden="true">
          {item.cover_cards.slice(0, 3).map((src, i) => (
            <img src={src} key={`${src}-${i}`} alt="" loading="lazy" />
          ))}
        </div>
      ) : (
        <Newspaper size={64} aria-hidden="true" />
      )}
      <span className={styles.newsRibbon}>
        {item.boards?.some((b) => b !== 'yugioh') ? 'MyL' : item.format || 'TCG'} ·{' '}
        {webNewsCategories[item.category || 'news']}
      </span>
    </div>
  );
}
export function WebNewsColumn({ board = 'yugioh' }: { board?: NewsBoard }) {
  const title = newsBoards[board];
  const router = useRouter();
  const params = useSearchParams();
  const remote = useRemote<WebNewsItem[]>('/news/web-sources');
  const requestedCategory = params.get('categoria');
  const category: WebNewsCategory | '' = ['reveals', 'releases'].includes(requestedCategory || '')
    ? (requestedCategory as WebNewsCategory)
    : '';
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const items = (remote.data || [])
    .filter((item) => item.category !== 'banlist' && (item.boards || ['yugioh']).includes(board))
    .sort((a, b) => b.published_on.localeCompare(a.published_on) || a.id.localeCompare(b.id));
  function chooseCategory(value: WebNewsCategory | '') {
    setLimit(8);
    if (value === category) return;
    const query = new URLSearchParams(params.toString());
    query.set('seccion', board);
    if (query.get('categoria') === 'banlist') query.set('vista', 'banlists');
    query.delete('categoria');
    if (value) query.set('categoria', value);
    router.push(`/noticias?${query}`, { scroll: false });
  }
  function clearFilters() {
    setQuery('');
    chooseCategory('');
  }
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const visible = items.filter(
    (item) =>
      (!category || (item.category || 'news') === category) &&
      normalize(item.title + ' ' + item.summary).includes(normalize(query)),
  );
  return (
    <section className={styles.worldNews} aria-labelledby="world-news-heading">
      <div className={styles.worldHeading}>
        <BookOpen size={23} aria-hidden="true" />
        <h2 id="world-news-heading">{title}</h2>
      </div>
      <div className={styles.newsToolbar}>
        <div className={styles.topicPicker}>
          <div
            className={styles.newsFilters}
            role="group"
            aria-label={`Categoría de noticias ${board === 'yugioh' ? 'TCG / OCG' : title}`}
          >
            <button
              type="button"
              aria-label="Todas"
              aria-pressed={!category}
              onClick={() => chooseCategory('')}
            >
              Todas
              {!remote.loading && !remote.error && <small aria-hidden="true">{items.length}</small>}
            </button>
            {Object.entries(webNewsCategories)
              .filter(([key]) => ['reveals', 'releases'].includes(key))
              .map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-label={label}
                  aria-pressed={category === key}
                  onClick={() => chooseCategory(key as WebNewsCategory)}
                >
                  {label}
                  {!remote.loading && !remote.error && (
                    <small aria-hidden="true">
                      {items.filter((item) => (item.category || 'news') === key).length}
                    </small>
                  )}
                </button>
              ))}
          </div>
        </div>
        <label className={styles.newsSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label={`Buscar noticias ${board === 'yugioh' ? 'TCG / OCG' : title}`}
            placeholder="Buscar noticia…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(8);
            }}
          />
        </label>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div role="alert">
          <p>No pudimos cargar las noticias.</p>
          <button className="store-text-link" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : !items.length ? (
        <div className={styles.worldEmpty}>
          <h3>Pronto tendremos novedades</h3>
          <p>Las noticias seleccionadas de este formato aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <div className={styles.resultsBar}>
            <p className={styles.newsCount} role="status">
              {visible.length} {visible.length === 1 ? 'noticia' : 'noticias'} · Más recientes
              primero
            </p>
            {(category || query) && (
              <button type="button" className="store-text-link" onClick={clearFilters}>
                Quitar filtros
              </button>
            )}
          </div>
          {visible.length ? (
            <div className={styles.tcgGrid}>
              {visible.slice(0, limit).map((item) => (
                <article key={item.id} className={styles.tcgCard}>
                  <Link
                    className={styles.newsPoster}
                    aria-labelledby={`news-title-${item.id}`}
                    href={
                      item.article_path || localWebArticle(item.url) || `/noticias/tcg/${item.id}`
                    }
                  >
                    <WebNewsCover item={item} />
                    <div className={styles.newsCardText}>
                      <time dateTime={item.published_on}>
                        {new Intl.DateTimeFormat('es-CL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        }).format(new Date(`${item.published_on}T12:00:00Z`))}
                      </time>
                      <h3 id={`news-title-${item.id}`}>{item.title}</h3>
                      <p>{item.summary}</p>
                      <span className={styles.read}>
                        Leer en español <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.worldEmpty}>
              No hay noticias con estos filtros. Prueba otra categoría o búsqueda.
            </p>
          )}
          {visible.length > limit && (
            <button
              type="button"
              className="store-button store-button-secondary"
              onClick={() => setLimit((n) => n + 8)}
            >
              Ver más noticias
            </button>
          )}
        </>
      )}
    </section>
  );
}
