'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search, X, Layers3 } from 'lucide-react';
import styles from './EditionArticle.module.css';
import type { EditionDocument, EditionCard as Card } from '@/lib/edition-gallery';

const defaultDocument: EditionDocument = {
  name: 'Beyond the Brave',
  code: 'betb',
  title: 'Beyond the Brave',
  summary: 'Una edición. Todas sus cartas. Descubre tu próximo duelo.',
  body: 'Beyond the Brave reúne monstruos, Magias y Trampas para descubrir nuevas combinaciones. Aquí puedes recorrer la edición completa, comparar sus rarezas y leer cada efecto sin salir de SERGOD STORE.\n\nBusca por el nombre en español, en inglés o por su código BETB. Pulsa una carta para ampliar su imagen y consultar el texto en español de la base oficial de Konami.',
  updated: '2026-10-09',
  cards: [],
};
export const rarityNames: Record<string, string> = {
  Common: 'Común',
  'Super Rare': 'Súper rara',
  'Ultra Rare': 'Ultra rara',
  'Secret Rare': 'Secreta',
  'Starlight Rare': 'Starlight',
};
const typeNames: Record<string, string> = {
  'Effect Monster': 'Monstruo de efecto',
  'Normal Monster': 'Monstruo normal',
  'Tuner Monster': 'Monstruo Cantante',
  'Flip Effect Monster': 'Monstruo de Volteo',
  'Fusion Monster': 'Monstruo de Fusión',
  'Synchro Monster': 'Monstruo de Sincronía',
  'XYZ Monster': 'Monstruo Xyz',
  'Link Monster': 'Monstruo de Enlace',
  'Pendulum Effect Monster': 'Monstruo de Péndulo',
  'Spell Card': 'Carta Mágica',
  'Trap Card': 'Carta de Trampa',
};
const attributes: Record<string, string> = {
  DARK: 'OSCURIDAD',
  LIGHT: 'LUZ',
  WATER: 'AGUA',
  FIRE: 'FUEGO',
  WIND: 'VIENTO',
  EARTH: 'TIERRA',
  DIVINE: 'DIVINO',
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function EditionArticle({ code }: { code?: string } = {}) {
  const preview = useSearchParams().get('vista') === 'admin';
  const [documentData, setDocumentData] = useState<EditionDocument | null>(
    code ? null : defaultDocument,
  );
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState('');
  const [selected, setSelected] = useState<Card | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(
      code
        ? `/api/${preview ? 'admin/news/editions' : 'news/editions'}/${encodeURIComponent(code)}${preview ? '/preview' : ''}`
        : '/editions/betb/cards.json',
      { signal: controller.signal, cache: preview ? 'no-store' : 'default' },
    )
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setCards(data.cards);
        setDocumentData(code ? data : { ...defaultDocument, ...data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [version, code, preview]);
  useEffect(() => {
    if (!selected || !dialog.current) return;
    const previous = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, [selected]);
  const filtered = cards.filter(
    (card) =>
      (!rarity || card.printings.some((printing) => printing.rarity === rarity)) &&
      normalize(
        `${card.name} ${card.englishName} ${card.printings.map((printing) => printing.code).join(' ')}`,
      ).includes(normalize(query.trim())),
  );
  if (!documentData)
    return (
      <article className={styles.article}>
        <Link href="/noticias">Volver a Noticias</Link>
        {error ? (
          <div role="alert">
            <h1>Guía no disponible</h1>
            <p>Puede que aún no esté publicada o que no tengas acceso a su vista previa.</p>
            <button onClick={() => setVersion((value) => value + 1)}>Reintentar</button>
          </div>
        ) : (
          <p role="status">Cargando la edición…</p>
        )}
      </article>
    );
  return (
    <article className={styles.article}>
      <Link className={styles.back} href="/noticias">
        <ArrowLeft size={16} /> Volver a Noticias
      </Link>
      <header className={styles.header}>
        <div className={styles.eyebrow}>
          {preview && code ? 'VISTA PREVIA · SIN PUBLICAR' : 'GUÍA DE EDICIÓN · YU-GI-OH! TCG'}
        </div>
        <h1>
          {code ? (
            documentData.title
          ) : (
            <>
              Beyond the <em>Brave</em>
            </>
          )}
        </h1>
        <p>{documentData.summary}</p>
        <div className={styles.meta}>
          <span>
            <Layers3 size={16} /> {cards.length || (code ? 0 : 100)} cartas distintas
          </span>
          <span>Textos en español</span>
          <time dateTime={documentData.updated}>
            Revisado el{' '}
            {new Intl.DateTimeFormat('es-CL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${documentData.updated}T12:00:00Z`))}
          </time>
        </div>
      </header>
      <div className={styles.intro}>
        <section>
          <h2>Explora antes de abrir</h2>
          {documentData.body
            .split(/\n+/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </section>
        <aside>
          <strong>¿Qué puede salir en un sobre?</strong>
          <p>
            Esta galería muestra las cartas de la edición, no el contenido garantizado de una caja.
            Las variantes de rareza se reúnen en una sola ficha por carta. Los extras promocionales
            de otros productos pueden ser diferentes.
          </p>
          <Link href={`/tienda?busqueda=${encodeURIComponent(documentData.name)}`}>
            Ver productos en la tienda →
          </Link>
        </aside>
      </div>
      <section className={styles.catalog} aria-labelledby="edition-gallery-heading">
        <div className={styles.catalogHeading}>
          <div>
            <span className={styles.eyebrow}>ELIGE TU PRÓXIMA CARTA</span>
            <h2 id="edition-gallery-heading">Galería de la edición</h2>
          </div>
          <span role="status">
            {cards.length ? `${filtered.length} de ${cards.length} cartas` : ''}
          </span>
        </div>
        <div className={styles.filters}>
          <label>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar carta"
              placeholder="Nombre o código de carta…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por rareza"
            value={rarity}
            onChange={(event) => setRarity(event.target.value)}
          >
            <option value="">Todas las rarezas</option>
            {Object.entries(rarityNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <div role="alert">
            No pudimos cargar las cartas.{' '}
            <button onClick={() => setVersion((value) => value + 1)}>Reintentar</button>
          </div>
        ) : !cards.length ? (
          <p role="status">Cargando la galería…</p>
        ) : !filtered.length ? (
          <p>No encontramos cartas con esos filtros.</p>
        ) : (
          <div className={styles.grid}>
            {filtered.map((card) => (
              <button
                key={card.id}
                className={styles.card}
                onClick={() => setSelected(card)}
                aria-label={`Ver carta: ${card.name}`}
              >
                <img
                  src={card.thumbnail}
                  alt={card.name}
                  width="220"
                  height="320"
                  loading="lazy"
                  decoding="async"
                />
                <span className={styles.code}>{card.printings[0].code}</span>
                <strong>{card.name}</strong>
                <small>
                  {[
                    ...new Set(
                      card.printings.map(
                        (printing) => rarityNames[printing.rarity] ?? printing.rarity,
                      ),
                    ),
                  ].join(' · ')}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>
      <footer className={styles.sources}>
        <strong>Fuentes y créditos</strong>
        <p>
          Guía redactada por SERGOD STORE. Catálogo e imágenes:{' '}
          <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noopener noreferrer">
            YGOPRODeck
          </a>
          . Nombres y efectos en español: base oficial de Konami, enlazada en cada carta.{' '}
          {documentData.code === 'betb' && (
            <>
              Referencia de la edición:{' '}
              <a
                href="https://www.yugiohmeta.com/articles/sets/tcg/betb"
                target="_blank"
                rel="noopener noreferrer"
              >
                Yu-Gi-Oh! Meta
              </a>
              .
            </>
          )}
        </p>
        <p>
          Las imágenes conservan su idioma original; los textos de consulta están en español.
          Yu-Gi-Oh! y sus cartas pertenecen a sus respectivos titulares.
        </p>
      </footer>
      {selected && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby="card-detail-title"
          onCancel={() => setSelected(null)}
          onClose={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                setSelected(null);
            }
          }}
        >
          <button
            className={styles.close}
            onClick={() => setSelected(null)}
            aria-label="Cerrar carta"
            autoFocus
          >
            <X size={22} />
          </button>
          <div className={styles.detail}>
            <img
              className={styles.largeImage}
              src={selected.image}
              alt={selected.name}
              width="600"
              height="875"
            />
            <div className={styles.detailText}>
              <span className={styles.eyebrow}>{documentData.name.toUpperCase()}</span>
              <h2 id="card-detail-title">{selected.name}</h2>
              <p className={styles.english}>{selected.englishName}</p>
              <div className={styles.stats}>
                <span>{typeNames[selected.type] ?? 'Monstruo'}</span>
                {selected.attribute && <span>{attributes[selected.attribute]}</span>}
                {selected.level !== null && (
                  <span>
                    {selected.type === 'XYZ Monster' ? 'Rango' : 'Nivel'} {selected.level}
                  </span>
                )}
                {selected.link !== null && <span>Enlace {selected.link}</span>}
                {selected.atk !== null && <span>ATK {selected.atk < 0 ? '?' : selected.atk}</span>}
                {selected.def !== null && <span>DEF {selected.def < 0 ? '?' : selected.def}</span>}
              </div>
              <h3>Texto de la carta en español</h3>
              {selected.effects.map((effect, index) => (
                <div key={index}>
                  {selected.effects.length > 1 && (
                    <h3>{index === 0 ? 'Efecto de Péndulo' : 'Efecto de monstruo'}</h3>
                  )}
                  <p className={styles.effect}>{effect}</p>
                </div>
              ))}
              <div className={styles.printings}>
                {selected.printings.map((printing, index) => (
                  <span key={index}>
                    {printing.code} · {rarityNames[printing.rarity] ?? printing.rarity}
                  </span>
                ))}
              </div>
              <a
                className={styles.official}
                href={selected.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                Consultar en Konami <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </dialog>
      )}
    </article>
  );
}
