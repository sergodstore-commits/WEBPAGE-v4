'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, ChartNoAxesCombined, RefreshCw } from 'lucide-react';
import { api } from '@/lib/client';
import type { Product } from '@/lib/types';
import styles from './trial.module.css';

const cardUrl =
  'https://tcgindex.io/yu-gi-oh/card/yugioh-beyond-the-brave-dark-time-wizard-ultra-rare';
const setUrl = 'https://tcgindex.io/yu-gi-oh/set/beyond-the-brave-yugioh';
const embedUrl =
  'https://tcgindex.io/embed/card/yugioh/yugioh-beyond-the-brave-dark-time-wizard-ultra-rare';

export default function ExplorerTrial() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState('');
  const [catalogState, setCatalogState] = useState('Cargando presentaciones…');
  const [opened, setOpened] = useState(false);
  const [revision, setRevision] = useState(0);
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
          <p>
            Elige una presentación y consulta una referencia de mercado sin salir de esta prueba.
          </p>
        </section>
        <div className={styles.layout}>
          <section className={styles.products} aria-label="Presentaciones de Beyond the Brave">
            <div className={styles.stage}>
              {product?.images[0] ? (
                <img src={product.images[0]} alt={product.name} />
              ) : (
                <ChartNoAxesCombined size={70} aria-hidden="true" />
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
          <section className={styles.market} aria-label="Referencia de una carta">
            <div className={styles.cardTitle}>
              <span>SINGLE DE EJEMPLO</span>
              <h2>Dark Time Wizard</h2>
              <p>Beyond the Brave · Ultra Rare</p>
            </div>
            {!opened ? (
              <div className={styles.placeholder}>
                <ChartNoAxesCombined size={45} />
                <h3>Su precio, a través del tiempo</h3>
                <p>Consulta el gráfico externo cuando lo necesites.</p>
                <button onClick={() => setOpened(true)}>Cargar precio e historial</button>
              </div>
            ) : (
              <>
                <iframe
                  key={revision}
                  className={styles.chart}
                  src={embedUrl}
                  title="Precio e historial de Dark Time Wizard · TCGIndex"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                <div className={styles.chartFooter}>
                  <a href={cardUrl} target="_blank" rel="noopener noreferrer">
                    Datos de mercado por TCGIndex <ArrowUpRight size={14} />
                  </a>
                  <button onClick={() => setRevision((n) => n + 1)}>
                    <RefreshCw size={15} /> Actualizar
                  </button>
                </div>
              </>
            )}
            <p className={styles.note}>
              Referencia externa en USD, no es el precio de venta de SERGOD. El proveedor controla
              los valores, el historial y su actualización. Si el gráfico no carga,{' '}
              <a href={cardUrl} target="_blank" rel="noopener noreferrer">
                abre la referencia
              </a>
              .
            </p>
            <a className={styles.listLink} href={setUrl} target="_blank" rel="noopener noreferrer">
              <span>
                Explorar cartas de la edición<small>Lista por precio en la web de TCGIndex</small>
              </span>
              <ArrowUpRight size={22} />
            </a>
            <p className={styles.note}>
              Esta prueba no incluye todavía la lista dentro de la tienda. No guardamos cartas,
              precios ni historial en Supabase.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
