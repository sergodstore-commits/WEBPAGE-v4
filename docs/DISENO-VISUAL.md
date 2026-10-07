# Rediseño visual de SERGOD STORE

Estado de la entrega final del 7 de octubre: las seis fases de interfaz y la revisión final están completadas. Se integran catálogo/preventas, torneos, comunidad, noticias, administración y compra/cuenta, con 96 pruebas de servidor y 40 recorridos únicos de navegador comprobados. La publicación está autorizada; Twitch e Instagram se conectarán después. Las secciones inferiores registran las verificaciones de cada fase en el momento en que se realizaron; el estado vigente está en `VERIFICATION.md`.

Entregas del rediseño, octubre de 2026: identidad compartida (logo, favicon, fuentes, colores, cabecera y pie), página de inicio, Tienda + Producto y Preventas. El plan vigente avanza una fase a la vez: Preventas; Torneos + Twitch; Comunidad + TOR MyL + ranking Yu-Gi-Oh!; Noticias + Instagram; Admin; Carrito + Cuenta + Checkout; revisión final. El propietario indica cuándo comienza cada fase.

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
- `ProductCard.tsx` y `ProductCard.module.css`: imágenes completas, rango de precios por familia, stock, opciones y vista rápida. El diseño nuevo se aplica en Tienda y Preventas; Home mantiene sus estilos. Hover breve sin 3D y transiciones desactivadas con movimiento reducido.
- `components/store/product/ProductDetail.tsx`: galería, nombre, precio, disponibilidad, selectores de formato/idioma y compra. Descripción y ficha técnica van debajo. Cambiar una variante actualiza su URL, fotografía, SKU, precio y disponibilidad; conserva los límites de cantidad y los campos de preventa.
- La vista rápida conserva cierre por Escape, devolución del foco y bloqueo del desplazamiento de fondo. Muestra dentro del diálogo el resultado real de añadir al carrito, incluyendo el error por superar el límite. La operación devuelve ese resultado al componente; no se confirma éxito mediante un temporizador ni una animación.

Los estilos nuevos están limitados a módulos CSS. No se incorporaron bibliotecas ni efectos del Hero a estas pantallas. El servidor local de revisión puede usar `NEXT_DIST_DIR=.next-shop-dev` (ignorado por Git); el servidor de E2E continúa usando `.next-e2e` y la base aislada `.data/e2e`.

## Preventas

El catálogo reutiliza búsqueda, filtros móviles y URL persistente. Las tarjetas muestran reserva abierta, próxima apertura, cierre, cupos agotados o fechas por confirmar. La apertura/cierre se presentan como período de reserva, separados de las condiciones de entrega. Los productos agrupados solo muestran fechas y condiciones comunes cuando todas sus opciones coinciden; en caso contrario indican revisar cada opción. La ficha y la vista rápida muestran fechas en America/Santiago, cupos y máximo por cliente del formato/idioma seleccionado. La tarjeta lleva a revisar la preventa antes de añadirla.

`lib/preorders.ts` centraliza estados y condiciones comunes; `tests/preorders.test.ts` verifica límites temporales y familias con fechas distintas. `tests/e2e/preorder-design.spec.ts` comprueba estados, filtros/recarga, anchos 320/375/768/1440, cambio de idioma/precio/condiciones/límite, carrito, vacíos y recuperación tras error. Usa API simulada sin escrituras. El recorrido existente en `tests/e2e/store.spec.ts` comprueba creación administrativa, subida de imagen, publicación, lectura y recarga real local, edición y retiro. Las pruebas no cobran, envían correos ni cambian el catálogo de producción.

Validación del 7 de octubre: tipos, formato y compilación de producción correctos; 2 pruebas de lógica y 9 recorridos de navegador comprobados (4 Preventas, 4 regresión Tienda/Producto y 1 guardado real de preventa). Revisión visual en escritorio/celular, incluido contraste de entrega; capturas privadas en `.data/preorder-review-20261007`. Fase terminada localmente, publicación prevista en la revisión final del plan vigente.

Los efectos se pausan fuera del Hero, al ocultar la pestaña y al pulsar Pausar movimiento. La preferencia de movimiento reducido del sistema se atiende en vivo y muestra una escena estática. El scroll sigue siendo nativo; no hay captura del gesto ni desplazamiento automático.

La entrada se ejecuta una vez por montaje: cartas, título, descripción, acciones y categorías. El texto y los controles permanecen visibles y disponibles durante toda la secuencia. La profundidad del cursor y del scroll usa los roles `near > lead > companion > far`; el reflejo foil sigue la inclinación en una capa independiente del barrido ambiental.

El Hero y sus enlaces se renderizan sin esperar al motor de animación. La Home sigue usando las API existentes y conserva carga, errores recuperables y estados vacíos. Los torneos pasados no aparecen en próximos torneos. Los enlaces por juego usan `?categoria=` y conservan el filtro al recargar.

## Torneos + Twitch

`components/store/tournaments/Tournaments.tsx` presenta cartelera cronológica de próximas fechas, directo activado desde Admin y archivo paginado de seis VOD. Las tarjetas cargan miniaturas; el reproductor solo se monta al seleccionar una transmisión. Incluye cierre por Escape, devolución del foco y enlace a Twitch cuando el espacio no permite su reproductor. El detalle del torneo mantiene fecha, lugar y contenido opcionales; no incluye inscripciones ni pagos.

`components/admin/TwitchAdmin.tsx` incorpora Integraciones y Transmisiones, reutilizando el panel existente. La revisión del canal no importa automáticamente: permite elegir, previsualizar y guardar cada VOD. Los metadatos publicados se leen desde BD sin consultar Twitch en cada visita. OAuth, cifrado de tokens, refresh, migraciones y configuración pendiente se explican en [TWITCH.md](TWITCH.md). El propietario registrará la aplicación al final; la conexión y reproducción reales siguen pendientes.

Validación local del 7 de octubre: 80 pruebas de servidor aprobadas, incluidas las de OAuth/proveedor simulado, persistencia al reabrir BD y operaciones sobre transmisiones. Seis recorridos de navegador comprueban cartelera, archivo, directo, permisos, publicación real local de torneos y rutas públicas/panel en escritorio y celular. El recorrido de transmisiones verifica revisión sin importación automática → miniatura personalizada → publicación → recarga → retiro, con API simulada; las pruebas de servidor comprueban su persistencia real local. La compilación de producción y el trazado del servidor también están comprobados. Capturas revisadas en `.data/tournaments-review-20261007`. No se publicaron estos cambios ni se modificó producción.

## Comunidad + rankings

`components/store/community/Community.tsx` presenta Primera Era, Primer Bloque y Ranking SERGOD STORE de Yu-Gi-Oh! en clasificaciones independientes. La selección se conserva en URL, con primeros tres puestos, búsqueda de jugadores, tabla adaptable, más resultados y detalle de los torneos que aportan puntos. Los anuncios de Comunidad conservan sus accesos debajo. Los estados vacíos y errores ofrecen acciones claras. No incorpora un foro ni efectos del Hero.

**Admin → Liga SERGOD STORE** revisa las Ligas públicas de TOR, descubre la última ronda disponible y exige vista previa/aprobación antes de guardar. Yu-Gi-Oh! admite subida CSV/TSV o texto con revisión de jugadores. Corregir reemplaza resultados; eliminar retira su aporte. Integraciones muestra el Store ID configurado para TOR. El formato real del reporte Yu-Gi-Oh! aún no se conoce y queda pendiente validarlo. Persistencia, controles, migración009 y límites del adaptador están en [RANKINGS.md](RANKINGS.md).

Validación local del 7 de octubre: 88/88 pruebas de servidor, tipos y compilación de producción correctos. Seis recorridos únicos de navegador comprobados: cuatro de Comunidad/Liga y regresiones de publicaciones y 22 rutas públicas/administrativas en escritorio/celular. La repetición de dos recorridos precisó selectores de las pruebas; no requirió cambiar la implementación. El recorrido Yu-Gi-Oh! utiliza guardado y lectura local reales, incluyendo recarga, corrección y eliminación. TOR automatizado usa contratos controlados; el adaptador también consultó TOR real anónimamente y obtuvo standings de cuatro y tres rondas. Capturas revisadas en `.data/community-review-20261007`. No se aplicaron migraciones ni cambios a producción.

## Noticias + Instagram

`components/store/news/News.tsx` presenta la noticia aprobada más reciente en un visor con imagen, carrusel propio o MP4, fecha y caption. Mantiene controles por teclado, swipe móvil y videos sin autoplay ni descarga inicial del archivo. Las tarjetas anteriores usan miniaturas; seleccionarlas actualiza la URL, mueve el visor y devuelve el foco. Nueve tarjetas iniciales y Ver más. Conserva noticias manuales y sus detalles; la portada incluye las importadas. Estados vacíos, errores y archivos no disponibles ofrecen acciones claras.

`components/admin/InstagramAdmin.tsx` incorpora Instagram a Integraciones y la gestión de Noticias importadas. Hashtag configurable, revisión paginada de la cuenta conectada, exclusión de IDs guardados, vista previa y aprobación explícita. No exige reescribir captions/títulos. Los archivos aprobados se copian al almacenamiento propio: imágenes optimizadas con la infraestructura existente y MP4 en un bucket adicional. No hay consultas a Instagram en cada visita pública. Las relaciones con Torneos y Liga son opcionales. Configuración, permisos, migración010, límites de archivo y pruebas reales pendientes se explican en [INSTAGRAM-NOTICIAS.md](INSTAGRAM-NOTICIAS.md). Las Stories no se incorporan a este archivo.

Validación local del 7 de octubre: 96/96 pruebas de servidor, TypeScript, compilación de producción y trazado correctos. Seis recorridos únicos de navegador comprobados: cuatro de Noticias/Instagram y regresiones de publicaciones manuales y 23 rutas públicas/administrativas. Dos recorridos se repitieron al precisar eventos Touch y un selector de vista previa de las pruebas. Un ajuste posterior mantiene el enlace a Publicaciones dentro del párrafo en celular y captura errores de lectura después de guardar; el recorrido administrativo se comprobó nuevamente con la compilación final. La prueba adicional verifica guardado/recarga real local del hashtag, permisos/origen y rechazo de importaciones sin vista previa. Los tests de servidor guardan fotos y MP4 locales, reabren la BD y conservan los resultados con proveedor simulado; el recorrido de importación en navegador utiliza API simulada. Capturas escritorio/móvil/panel en `.data/news-review-20261007`. La conexión OAuth, permisos/contrato de Meta y reproducción de un Reel del canal real siguen pendientes; no se publicaron cambios ni se modificó producción.

## Recursos de identidad

El propietario proporcionó el logo y las cuatro imágenes de cartas. Los originales del Hero están en `public/art/hero`; no se redibujaron ni se eliminaron marcas de agua. El logo transparente está en `public/brand/sergod-logo.webp`. `node scripts/brand-icons.mjs` obtiene los iconos de pestaña y Apple a partir de la S del mismo logo.

`node scripts/optimize-brand-assets.mjs` genera derivados WebP de cada carta (tamaño original y 320 px de ancho) y un logo de 480 px para cabecera/pie. Verifica que los originales no cambien. Las cartas usan `srcset` y `sizes` para que el navegador elija según el ancho y la densidad de pantalla. Las cuatro cartas originales suman 1.743.912 bytes; las versiones WebP completas, 293.668 bytes, y las de 320 px, 229.714 bytes. El logo servido pasa de 313.882 a 72.856 bytes.

Inter (variable) y Barlow Condensed (700/800), subconjunto latino con caracteres españoles, se sirven localmente mediante `next/font/local`. Sus archivos y licencias OFL están en `public/fonts`. Fuentes obtenidas de Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`); licencias del repositorio oficial `google/fonts`. No hay solicitudes de fuentes a terceros al visitar la web.

## Verificación

Los recorridos nuevos de `tests/e2e/hero.spec.ts` comprueban anchos 320/375/768/1440, recursos, CTA, menú por teclado, pausa persistente y movimiento reducido, carga del Hero solo en Inicio, datos publicados, fechas de torneos, filtros por juego y recarga. Los datos simulados de presentación no se guardan; los demás recorridos usan PostgreSQL local aislado en `.data/e2e`.

Ejecutar `npm run typecheck`, `npm test` y `npm run test:e2e`. Este último compila para producción y valida también el trazado de archivos del servidor. No ejecuta cobros reales ni modifica producción.

Para medir una compilación local de producción ya iniciada: `node scripts/measure-home.mjs http://localhost:3101 .data/home-performance-after`. El script no modifica datos; guarda métricas y capturas con caché de navegador vacía. Usa una muestra de escritorio y tres de móvil emulado (375 px, densidad 2, CPU ×4, red 1,6 Mbps y latencia de 150 ms). Registrar ambos conjuntos antes/después bajo las mismas condiciones. Son mediciones de laboratorio: los intervalos de `requestAnimationFrame` no certifican FPS de GPU, experiencia en un teléfono real ni Core Web Vitals de usuarios reales.

Comprobación de Home del 3 de octubre de 2026 (entrega `b039b43`): TypeScript, compilación de producción y 14/14 recorridos de navegador correctos. Comparación local contra `00d0339`, con el mismo perfil de medición:

| Medida                                      | Escritorio antes → después | Móvil antes → después     |
| ------------------------------------------- | -------------------------- | ------------------------- |
| LCP                                         | 2.736 → 1.672 ms           | 10.580 → 3.644 ms         |
| Descarga de cartas (incluye cabeceras HTTP) | 1.745.716 → 231.514 bytes  | 1.745.716 → 231.514 bytes |
| CLS                                         | 0,06351 → 0,06351          | 0,02247 → 0,01751         |
| Intervalo rAF p95                           | 33,3 → 17,1 ms             | 17,0 → 33,4 ms            |

Las cuatro imágenes terminaron de cargar en todas las muestras, con movimiento activo, sin errores JavaScript ni desbordamiento horizontal. La carga principal mejora; la muestra de cadencia móvil presenta más intervalos largos y no permite afirmar una mejora de fluidez ni 60 FPS constantes. Los resultados completos y las capturas quedan en `.data/home-performance-before/` y `.data/home-performance-after/`, fuera del repositorio. Son dos ejecuciones locales secuenciales sobre la base aislada de E2E; el contenido de prueba bajo el Hero no representa el catálogo público.

`tests/e2e/shop-design.spec.ts` añade cuatro recorridos para Tienda y Producto: controles y precios entre 320 y 1440 px; filtros móviles con teclado, recarga y limpieza; seis variantes Sobre/Token box/Display de 24 × Español/Inglés con descuentos, agotados, galería y cantidades; vista rápida con retorno del foco y respuesta real al añadir/rechazar unidades. Sus respuestas de API están simuladas en el navegador y se rechazan escrituras. Los recorridos existentes de familias y checkout siguen comprobando guardado real local y stock independiente.

Validación de Tienda + Producto: TypeScript, formato y compilación de producción correctos; los 18 recorridos comprobados (17 en la ejecución completa y el de familias en repetición dirigida después de precisar su selector de checkbox). Revisión visual con el catálogo público, simulado solo en el navegador local, en escritorio y móvil: Tienda, Producto y Vista rápida sin errores JavaScript ni desbordamientos. Las capturas quedan en `.data/shop-review/`.

## Admin

La fase 5 organiza el panel existente por Catálogo, Ventas, Comunidad y contenido, y Configuración, con Nuevo artículo destacado, logo oficial, navegación de ubicación y estilos compartidos para formularios, estados, tablas y resúmenes. La barra lateral grafito tiene desplazamiento propio; el menú hasta 900 px admite teclado, Escape, foco contenido y restauración después de quitar el bloqueo del fondo. La navegación entre páginas conserva el destino del foco si Next vuelve a montar el panel. Consulta `docs/ADMIN.md`.

Validación local del 7 de octubre de 2026: TypeScript, compilación de producción y trazado correctos; ocho recorridos únicos de navegador aprobados: dos del nuevo panel y seis regresiones de artículos/preventas con imágenes y CRUD público, POS/stock, configuración, publicaciones y 23 rutas en escritorio/celular. Se corrigió la restauración del foco y se precisaron selectores durante las repeticiones dirigidas; los dos recorridos nuevos pasaron con la compilación final, incluida la visibilidad y el contraste del cierre móvil; se separó la prioridad de color de la regla responsive de visibilidad. Anchos del panel comprobados: 320, 375, 820, 1024 y 1440 px. Capturas finales en `.data/admin-review-20261007`; base local aislada, sin cambios de producción. No hay migraciones nuevas. La fase 6 y la publicación esperan instrucción.

## Carrito, Cuenta y Checkout

Fase 6 preparada localmente en `components/store/commerce`, reutilizando la lógica de servicios existente. Los pasos distinguen revisión del carrito, entrega y revisión, y pago externo en Flow. Se mejoraron importes, descuentos, modalidades de entrega, cuenta/perfil, historial y detalle de pedido. El foco lleva al encabezado al cambiar de paso. Las unidades y reglas de pago siguen comprobándose en el servidor. Se corrigió el total al regresar al carrito después de seleccionar flete cobrado online, y el desbordamiento de controles de cantidad heredado en 320 px. Consulta `docs/COMPRA-CUENTA.md`.

Comprobación local del 7 de octubre: TypeScript, compilación de producción y trazado correctos; nueve recorridos únicos de navegador aprobados. Cuatro recorridos nuevos usan API simulada para estados y presentación; las regresiones comprueban guardado real local de cuenta y carrito, verificación por correo local, checkout solo desde el botón final, límites de preventas y responsive de 23 rutas. Los seis recorridos pertinentes al ajuste final pasaron con la compilación final; se precisaron selectores de pruebas durante las iteraciones. Capturas finales en `.data/commerce-review-20261007`. No se cobran pagos reales ni se modifica producción en esta fase. Se espera instrucción para revisión final/publicación.
