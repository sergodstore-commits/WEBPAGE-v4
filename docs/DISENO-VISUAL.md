# Rediseño visual de SERGOD STORE

Entregas del rediseño, octubre de 2026: identidad compartida (logo, favicon, fuentes, colores, cabecera y pie), página de inicio y etapa Tienda + Producto. La siguiente etapa, Preventas + Torneos, espera la revisión del propietario. Los recorridos comerciales conservan sus datos y operaciones; no hay cambios de base de datos, stock, precios, pagos o permisos.

## Archivos y decisiones

- `styles/tokens.css`: paleta negro/grafito/plata/cian, tipografías, radios y tiempos. `styles/store-foundation.css` aplica los estilos comunes solamente a `.store-app`.
- `components/store/StoreHeader.tsx` y `StoreFooter.tsx`: navegación adaptable, menú con teclado/Escape, cuenta, carrito y datos del local obtenidos del servidor.
- `components/store/home/HomeHero.tsx`: mensaje, acciones, accesos a los dos juegos y control persistente del movimiento. `HomeSections.tsx`: servicios, productos, preventas, próximos torneos, comunidad/noticias y ubicación reales.
- `components/hero/TradingCard3D.tsx`: colocación, entrada, ambiente, scroll, cursor y caras independientes. Las imágenes conservan su proporción; el reverso tiene su propia cara. Sin Three.js.
- `lib/hero/presets.ts`: cuatro cartas en escritorio y dos en móvil. Estos adornos no son productos ni indican disponibilidad. El futuro editor del Hero todavía no está implementado.
- `lib/motion`: duraciones compartidas y preferencia `sergod.motion.paused`. Anime.js 4.5.0 se importa desde el Hero; no se ejecuta en las otras rutas.

## Tienda y Producto

- `components/store/shared.tsx`: componentes comunes, lectura de API y funciones de disponibilidad/agrupación extraídas de `StoreApp`, compartidas con las pantallas existentes.
- `components/store/catalog/Catalog.tsx`: encabezado de Tienda, categorías destacadas obtenidas de datos publicados, búsqueda, orden y filtros. En móvil (hasta 900 px) los filtros se despliegan con un botón accesible; los criterios aplicados se pueden retirar individualmente o limpiar. Búsqueda, categoría, marca, características, precios, disponibilidad, orden y página se conservan en la URL y al recargar. Se usa History API integrada con `useSearchParams`, sin solicitudes de navegación por cada pulsación.
- `ProductCard.tsx` y `ProductCard.module.css`: imágenes completas, rango de precios por familia, stock, opciones y vista rápida. El diseño nuevo es optativo en Tienda; Home y el listado de Preventas mantienen sus estilos. Hover breve sin 3D y transiciones desactivadas con movimiento reducido.
- `components/store/product/ProductDetail.tsx`: galería, nombre, precio, disponibilidad, selectores de formato/idioma y compra. Descripción y ficha técnica van debajo. Cambiar una variante actualiza su URL, fotografía, SKU, precio y disponibilidad; conserva los límites de cantidad y los campos de preventa.
- La vista rápida conserva cierre por Escape, devolución del foco y bloqueo del desplazamiento de fondo. Muestra dentro del diálogo el resultado real de añadir al carrito, incluyendo el error por superar el límite. La operación devuelve ese resultado al componente; no se confirma éxito mediante un temporizador ni una animación.

Los estilos nuevos están limitados a módulos CSS. No se incorporaron bibliotecas ni efectos del Hero a estas pantallas. El servidor local de revisión puede usar `NEXT_DIST_DIR=.next-shop-dev` (ignorado por Git); el servidor de E2E continúa usando `.next-e2e` y la base aislada `.data/e2e`.

Los efectos se pausan fuera del Hero, al ocultar la pestaña y al pulsar Pausar movimiento. La preferencia de movimiento reducido del sistema se atiende en vivo y muestra una escena estática. El scroll sigue siendo nativo; no hay captura del gesto ni desplazamiento automático.

La entrada se ejecuta una vez por montaje: cartas, título, descripción, acciones y categorías. El texto y los controles permanecen visibles y disponibles durante toda la secuencia. La profundidad del cursor y del scroll usa los roles `near > lead > companion > far`; el reflejo foil sigue la inclinación en una capa independiente del barrido ambiental.

El Hero y sus enlaces se renderizan sin esperar al motor de animación. La Home sigue usando las API existentes y conserva carga, errores recuperables y estados vacíos. Los torneos pasados no aparecen en próximos torneos. Los enlaces por juego usan `?categoria=` y conservan el filtro al recargar.

## Recursos

El propietario proporcionó el logo y las cuatro imágenes de cartas. Los originales del Hero están en `public/art/hero`; no se redibujaron ni se eliminaron marcas de agua. El logo transparente está en `public/brand/sergod-logo.webp`. `node scripts/brand-icons.mjs` obtiene los iconos de pestaña y Apple a partir de la S del mismo logo.

`node scripts/optimize-brand-assets.mjs` genera derivados WebP de cada carta (tamaño original y 320 px de ancho) y un logo de 480 px para cabecera/pie. Verifica que los originales no cambien. Las cartas usan `srcset` y `sizes` para que el navegador elija según el ancho y la densidad de pantalla. Las cuatro cartas originales suman 1.743.912 bytes; las versiones WebP completas, 293.668 bytes, y las de 320 px, 229.714 bytes. El logo servido pasa de 313.882 a 72.856 bytes.

Inter (variable) y Barlow Condensed (700/800), subconjunto latino con caracteres españoles, se sirven localmente mediante `next/font/local`. Sus archivos y licencias OFL están en `public/fonts`. Fuentes obtenidas de Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`); licencias del repositorio oficial `google/fonts`. No hay solicitudes de fuentes a terceros al visitar la web.

## Verificación

Los recorridos nuevos de `tests/e2e/hero.spec.ts` comprueban anchos 320/375/768/1440, recursos, CTA, menú por teclado, pausa persistente y movimiento reducido, carga del Hero solo en Inicio, datos publicados, fechas de torneos, filtros por juego y recarga. Los datos simulados de presentación no se guardan; los demás recorridos usan PostgreSQL local aislado en `.data/e2e`.

Ejecutar `npm run typecheck`, `npm test` y `npm run test:e2e`. Este último compila para producción y valida también el trazado de archivos del servidor. No ejecuta cobros reales ni modifica producción.

Para medir una compilación local de producción ya iniciada: `node scripts/measure-home.mjs http://localhost:3101 .data/home-performance-after`. El script no modifica datos; guarda métricas y capturas con caché de navegador vacía. Usa una muestra de escritorio y tres de móvil emulado (375 px, densidad 2, CPU ×4, red 1,6 Mbps y latencia de 150 ms). Registrar ambos conjuntos antes/después bajo las mismas condiciones. Son mediciones de laboratorio: los intervalos de `requestAnimationFrame` no certifican FPS de GPU, experiencia en un teléfono real ni Core Web Vitals de usuarios reales.

Comprobación de Home del 3 de octubre de 2026 (entrega `b039b43`): TypeScript, compilación de producción y 14/14 recorridos de navegador correctos. Comparación local contra `00d0339`, con el mismo perfil de medición:

| Medida | Escritorio antes → después | Móvil antes → después |
| --- | --- | --- |
| LCP | 2.736 → 1.672 ms | 10.580 → 3.644 ms |
| Descarga de cartas (incluye cabeceras HTTP) | 1.745.716 → 231.514 bytes | 1.745.716 → 231.514 bytes |
| CLS | 0,06351 → 0,06351 | 0,02247 → 0,01751 |
| Intervalo rAF p95 | 33,3 → 17,1 ms | 17,0 → 33,4 ms |

Las cuatro imágenes terminaron de cargar en todas las muestras, con movimiento activo, sin errores JavaScript ni desbordamiento horizontal. La carga principal mejora; la muestra de cadencia móvil presenta más intervalos largos y no permite afirmar una mejora de fluidez ni 60 FPS constantes. Los resultados completos y las capturas quedan en `.data/home-performance-before/` y `.data/home-performance-after/`, fuera del repositorio. Son dos ejecuciones locales secuenciales sobre la base aislada de E2E; el contenido de prueba bajo el Hero no representa el catálogo público.

`tests/e2e/shop-design.spec.ts` añade cuatro recorridos para Tienda y Producto: controles y precios entre 320 y 1440 px; filtros móviles con teclado, recarga y limpieza; seis variantes Sobre/Token box/Display de 24 × Español/Inglés con descuentos, agotados, galería y cantidades; vista rápida con retorno del foco y respuesta real al añadir/rechazar unidades. Sus respuestas de API están simuladas en el navegador y se rechazan escrituras. Los recorridos existentes de familias y checkout siguen comprobando guardado real local y stock independiente.

Validación de Tienda + Producto: TypeScript, formato y compilación de producción correctos; los 18 recorridos comprobados (17 en la ejecución completa y el de familias en repetición dirigida después de precisar su selector de checkbox). Revisión visual con el catálogo público, simulado solo en el navegador local, en escritorio y móvil: Tienda, Producto y Vista rápida sin errores JavaScript ni desbordamientos. Las capturas quedan en `.data/shop-review/`.
