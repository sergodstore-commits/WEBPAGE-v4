# Base visual y Home

Primera entrega del rediseño, octubre de 2026. Alcance: identidad compartida (logo, favicon, fuentes, colores, cabecera y pie) y página de inicio. La siguiente etapa espera la revisión del propietario. El catálogo, checkout y panel conservan sus flujos; no hay cambios de base de datos, stock, precios, pagos o permisos.

## Archivos y decisiones

- `styles/tokens.css`: paleta negro/grafito/plata/cian, tipografías, radios y tiempos. `styles/store-foundation.css` aplica los estilos comunes solamente a `.store-app`.
- `components/store/StoreHeader.tsx` y `StoreFooter.tsx`: navegación adaptable, menú con teclado/Escape, cuenta, carrito y datos del local obtenidos del servidor.
- `components/store/home/HomeHero.tsx`: mensaje, acciones, accesos a los dos juegos y control persistente del movimiento. `HomeSections.tsx`: servicios, productos, preventas, próximos torneos, comunidad/noticias y ubicación reales.
- `components/hero/TradingCard3D.tsx`: colocación, entrada, ambiente, scroll, cursor y caras independientes. Las imágenes conservan su proporción; el reverso tiene su propia cara. Sin Three.js.
- `lib/hero/presets.ts`: cuatro cartas en escritorio y dos en móvil. Estos adornos no son productos ni indican disponibilidad. El futuro editor del Hero todavía no está implementado.
- `lib/motion`: duraciones compartidas y preferencia `sergod.motion.paused`. Anime.js 4.5.0 se importa desde el Hero; no se ejecuta en las otras rutas.

Los efectos se pausan fuera del Hero, al ocultar la pestaña y al pulsar Pausar movimiento. La preferencia de movimiento reducido del sistema se atiende en vivo y muestra una escena estática. El scroll sigue siendo nativo; no hay captura del gesto ni desplazamiento automático.

El Hero y sus enlaces se renderizan sin esperar al motor de animación. La Home sigue usando las API existentes y conserva carga, errores recuperables y estados vacíos. Los torneos pasados no aparecen en próximos torneos. Los enlaces por juego usan `?categoria=` y conservan el filtro al recargar.

## Recursos

El propietario proporcionó el logo y las cuatro imágenes de cartas. Los originales del Hero están en `public/art/hero`; no se redibujaron ni se eliminaron marcas de agua. El logo transparente está en `public/brand/sergod-logo.webp`. `node scripts/brand-icons.mjs` obtiene los iconos de pestaña y Apple a partir de la S del mismo logo.

Inter (variable) y Barlow Condensed (700/800), subconjunto latino con caracteres españoles, se sirven localmente mediante `next/font/local`. Sus archivos y licencias OFL están en `public/fonts`. Fuentes obtenidas de Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`); licencias del repositorio oficial `google/fonts`. No hay solicitudes de fuentes a terceros al visitar la web.

## Verificación

Los recorridos nuevos de `tests/e2e/hero.spec.ts` comprueban anchos 320/375/768/1440, recursos, CTA, menú por teclado, pausa persistente y movimiento reducido, carga del Hero solo en Inicio, datos publicados, fechas de torneos, filtros por juego y recarga. Los datos simulados de presentación no se guardan; los demás recorridos usan PostgreSQL local aislado en `.data/e2e`.

Ejecutar `npm run typecheck`, `npm test` y `npm run test:e2e`. Este último compila para producción y valida también el trazado de archivos del servidor. No ejecuta cobros reales ni modifica producción.
