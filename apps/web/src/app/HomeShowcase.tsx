import { useEffect, useRef, useState } from 'react';

import { publicRequest } from '../identity/api.js';

interface ShowcaseProduct {
  readonly productId: string;
  readonly name: string;
  readonly primaryResource: { readonly resourceId: string; readonly altText: string } | null;
}

const decorativeCards = Array.from({ length: 12 }, (_, index) => index);

/** The scene is decorative; real commerce remains in the existing catalog. */
export function HomeShowcase() {
  const [products, setProducts] = useState<readonly ShowcaseProduct[]>([]);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [visible, setVisible] = useState(!document.hidden);
  const scene = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const paint = useRef<() => void>(() => undefined);
  const moving = !paused && !interacting && !focused && !reducedMotion && visible;

  useEffect(() => {
    let disposed = false;
    void publicRequest<{ items: ShowcaseProduct[] }>(
      '/api/v1/catalog/products?limit=12&saleType=REGULAR&sort=NEWEST',
    )
      .then(({ items }) => {
        if (!disposed) setProducts(items.filter((item) => item.primaryResource !== null));
      })
      .catch(() => {
        /* An unavailable catalog never blocks home navigation. */
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(preference?.matches ?? false);
    const updateVisibility = () => setVisible(!document.hidden);
    preference?.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference?.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    const cards = Array.from(ring.current?.children ?? []) as HTMLElement[];
    const renderFrame = () => {
      for (const [index, card] of cards.entries()) {
        const degrees = angle.current + (index * 360) / cards.length;
        const radians = (degrees * Math.PI) / 180;
        const depth = Math.cos(radians);
        card.style.transform = `translate3d(${Math.sin(radians) * 430}px, ${-depth * 14}px, ${depth * 250 - 250}px) rotateY(${degrees}deg)`;
        card.style.opacity = String(0.35 + ((depth + 1) / 2) * 0.65);
      }
    };
    paint.current = renderFrame;
    renderFrame();
    if (!moving) return;
    let frame = 0;
    let previous: number | null = null;
    const tick = (time: number) => {
      if (previous !== null)
        angle.current = (angle.current + Math.min(time - previous, 50) * 0.005) % 360;
      previous = time;
      renderFrame();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [moving, products]);

  function turn(direction: number) {
    setPaused(true);
    angle.current += direction * (360 / decorativeCards.length);
    paint.current();
  }

  return (
    <section
      aria-label="Carrusel tridimensional del catálogo"
      className="home-showcase"
      data-moving={moving}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div
        className="home-showcase__scene"
        ref={scene}
        aria-hidden="true"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setInteracting(true);
        }}
        onPointerMove={(event) => {
          if (reducedMotion || event.pointerType !== 'mouse') return;
          const bounds = event.currentTarget.getBoundingClientRect();
          scene.current?.style.setProperty(
            '--look-x',
            `${((event.clientX - bounds.left) / bounds.width - 0.5) * 6}deg`,
          );
          scene.current?.style.setProperty(
            '--look-y',
            `${((event.clientY - bounds.top) / bounds.height - 0.5) * -4}deg`,
          );
        }}
        onPointerLeave={() => {
          setInteracting(false);
          scene.current?.style.setProperty('--look-x', '0deg');
          scene.current?.style.setProperty('--look-y', '0deg');
        }}
      >
        <div className="home-showcase__halo" />
        <div className="home-showcase__orbit" />
        <div className="home-showcase__perspective">
          <div className="home-showcase__ring" ref={ring}>
            {decorativeCards.map((index) => {
              const product = products.length > 0 ? products[index % products.length] : undefined;
              return (
                <div className="home-showcase__card" key={index} data-tone={index % 3}>
                  <div className="home-showcase__foil" />
                  {product?.primaryResource && (
                    <img
                      alt=""
                      src={`/api/v1/catalog/resources/${encodeURIComponent(product.primaryResource.resourceId)}/content`}
                      draggable={false}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                  {product && <span className="home-showcase__name">{product.name}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="home-showcase__particles">
          {decorativeCards.map((index) => (
            <i
              key={index}
              style={{
                left: `${8 + ((index * 29) % 84)}%`,
                top: `${12 + ((index * 19) % 64)}%`,
                animationDelay: `${index * -0.7}s`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="home-showcase__toolbar">
        <p>
          {products.length > 0
            ? 'Una mirada a nuestro catálogo'
            : 'Escena de cartas decorativas · explora el catálogo en Tienda'}
        </p>
        <div className="home-showcase__controls" role="group" aria-label="Movimiento del carrusel">
          <button type="button" aria-label="Girar a la izquierda" onClick={() => turn(-1)}>
            ‹
          </button>
          <button
            type="button"
            aria-label={
              paused || reducedMotion
                ? 'Reanudar movimiento automático'
                : 'Pausar movimiento automático'
            }
            aria-pressed={paused || reducedMotion}
            disabled={reducedMotion}
            onClick={() => {
              setPaused(!paused);
              if (paused) setFocused(false);
            }}
          >
            {reducedMotion ? 'Movimiento reducido' : paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button type="button" aria-label="Girar a la derecha" onClick={() => turn(1)}>
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
