'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Layers3 } from 'lucide-react';
import { api } from '@/lib/client';
import type { Product } from '@/lib/types';
import styles from './trial.module.css';
import { editionLinks } from '@/lib/edition-links';

const setUrl = editionLinks['ygo-beyond-the-brave'].url;

export default function ExplorerTrial() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState('');
  const [catalogState, setCatalogState] = useState('Cargando presentaciones…');
  useEffect(() => {
    let active = true;
    api<Product[]>('/products?kind=store')
      .then((items) => {
        if (!active) return;
        const edition = items.filter(
          (p) => p.catalog_group === 'ygo-beyond-the-brave' || /beyond the brave/i.test(p.name),
        );
        setProducts(edition);
        setSelected(edition[0]?.id || '');
        setCatalogState(edition.length ? '' : 'No hay presentaciones publicadas de esta edición.');
      })
      .catch(() => {
        if (active)
          setCatalogState(
            'No pudimos cargar los productos. Puedes volver a Tienda e intentarlo otra vez.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const product = products.find((p) => p.id === selected);
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/tienda">
            <ArrowLeft size={17} /> Volver a Tienda
          </Link>
          <span>LABORATORIO SERGOD · PRUEBA</span>
        </header>
        <section className={styles.intro}>
          <p>EXPLORA LA EDICIÓN</p>
          <h1>
            ¿Qué puede salir<span>?</span>
          </h1>
          <h2>Beyond the Brave</h2>
          <p>Elige una presentación y descubre las cartas que pueden salir en esta edición.</p>
        </section>
        <div className={styles.layout}>
          <section className={styles.products} aria-label="Presentaciones de Beyond the Brave">
            <div className={styles.stage}>
              {product?.images[0] ? (
                <img src={product.images[0]} alt={product.name} />
              ) : (
                <Layers3 size={70} aria-hidden="true" />
              )}
            </div>
            {catalogState && <p role="status">{catalogState}</p>}
            <div className={styles.formats} aria-label="Elegir presentación">
              {products.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                >
                  {p.images[0] && <img src={p.images[0]} alt="" />}
                  <span>
                    {p.options?.Formato || p.name}
                    <small>{p.options?.Idioma || ''}</small>
                  </span>
                </button>
              ))}
            </div>
            {product && (
              <Link className={styles.productLink} href={`/producto/${product.slug}`}>
                Ver este producto <ArrowUpRight size={17} />
              </Link>
            )}
            <p className={styles.note}>
              La lista corresponde a la edición. No garantiza las cartas de una caja ni los extras
              de una Token Box; el contenido aleatorio depende de cada presentación.
            </p>
          </section>
          <section className={styles.contents} aria-label="Cartas de la edición">
            <div className={styles.cardTitle}>
              <span>CONTENIDO DE LA EDICIÓN</span>
              <h2>¿Qué cartas puede traer?</h2>
              <p>Beyond the Brave · Yu-Gi-Oh! TCG</p>
            </div>
            <div className={styles.contentIntro}>
              <Layers3 size={45} aria-hidden="true" />
              <p>Consulta las cartas y sus rarezas antes de elegir tu sobre o caja.</p>
            </div>
            <a className={styles.listLink} href={setUrl} target="_blank" rel="noopener noreferrer">
              <span>
                Ver cartas de Beyond the Brave
                <small>Abre la lista en TCGplayer · Pestaña nueva</small>
              </span>
              <ArrowUpRight size={22} />
            </a>
            <p className={styles.note}>
              La lista se consulta en la fuente externa. No guardamos las cartas ni sus imágenes en
              Supabase.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
