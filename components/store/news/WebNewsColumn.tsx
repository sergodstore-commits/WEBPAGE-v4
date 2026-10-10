'use client';
import { useState } from 'react';
import { ArrowRight, BookOpen, Search, Newspaper } from 'lucide-react';
import Link from 'next/link';
import {
  localWebArticle,
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
      <span className={styles.newsRibbon}>TCG · {webNewsCategories[item.category || 'news']}</span>
    </div>
  );
}
export function WebNewsColumn() {
  const remote = useRemote<WebNewsItem[]>('/news/web-sources');
  const [category, setCategory] = useState<WebNewsCategory | ''>('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(8);
  const items = (remote.data || []).filter((item) =>
    item.format !== undefined ? item.format === 'TCG' : true,
  );
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const visible = items.filter(
    (item) =>
      (!category || item.category === category) &&
      normalize(item.title + ' ' + item.summary).includes(normalize(query)),
  );
  return (
    <section className={styles.worldNews} aria-labelledby="world-news-heading">
      <div className={styles.worldHeading}>
        <BookOpen size={23} aria-hidden="true" />
        <div>
          <span>ACTUALIDAD DEL JUEGO</span>
          <h2 id="world-news-heading">Yu-Gi-Oh! TCG</h2>
        </div>
      </div>
      <div className={styles.newsToolbar}>
        <div className={styles.newsFilters} role="group" aria-label="Categoría de noticias TCG">
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => {
              setCategory('');
              setLimit(8);
            }}
          >
            Todas
          </button>
          {Object.entries(webNewsCategories).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={category === key}
              onClick={() => {
                setCategory(key as WebNewsCategory);
                setLimit(8);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className={styles.newsSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar noticias TCG"
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
          <p>No pudimos cargar la actualidad de Yu-Gi-Oh!.</p>
          <button className="store-text-link" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : !items.length ? (
        <p className={styles.worldEmpty}>Pronto compartiremos más novedades del juego.</p>
      ) : (
        <>
          <p className={styles.newsCount} role="status">
            {visible.length} {visible.length === 1 ? 'noticia' : 'noticias'}
          </p>
          {visible.length ? (
            <div className={styles.tcgGrid}>
              {visible.slice(0, limit).map((item) => (
                <article key={item.id} className={styles.tcgCard}>
                  <Link
                    className={styles.newsPoster}
                    href={
                      item.article_path || localWebArticle(item.url) || `/noticias/tcg/${item.id}`
                    }
                  >
                    <WebNewsCover item={item} />
                    <div className={styles.posterTitle}>
                      <h3>{item.title}</h3>
                      <span>
                        Leer en español <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                  <div className={styles.newsCardText}>
                    <time dateTime={item.published_on}>
                      {new Intl.DateTimeFormat('es-CL', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }).format(new Date(`${item.published_on}T12:00:00Z`))}
                    </time>
                    <p>{item.summary}</p>
                  </div>
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
              Ver más noticias TCG
            </button>
          )}
        </>
      )}
    </section>
  );
}
