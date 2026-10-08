# Accesos de Tienda y Preventas

Ambas páginas ofrecen Todo, Yu-Gi-Oh!, MyL Primer Bloque, MyL Primera Era y Accesorios Zero Mulligan. La selección se conserva en `grupo` dentro de la URL, junto con búsqueda, precios, disponibilidad, orden y página. Entrar a una ficha y volver, o recargar, conserva los filtros.

La clasificación usa los datos existentes; no modifica categorías, artículos, formatos, idiomas, precios ni existencias:

- Yu-Gi-Oh!: categoría Yu-Gi-Oh!.
- MyL: identidad Mitos y Leyendas/MyL, con Primera Era o Primer Bloque en categoría, nombre de catálogo, nombre o etiquetas. Incluye Primera Era Extendido y Primer Bloque Extendido en su grupo correspondiente. No interpreta la descripción como clasificación.
- Zero Mulligan: marca Zero Mulligan, incluyendo protectores, dados y otros accesorios. Una mención a Yu-Gi-Oh! en el nombre de unas fundas no las convierte en cartas de ese juego.
- Los artículos de otro juego o marca siguen visibles en Todo y mediante las categorías habituales.

Al cambiar de grupo se conservan búsqueda, rango de precios, disponibilidad y orden. Categoría, marca y característica se conservan si existen en el grupo elegido; de lo contrario se limpian para evitar filtros incompatibles. Todo limpia esas tres selecciones específicas. La paginación vuelve a la primera página. Las familias siguen reuniendo sus variantes y muestran únicamente opciones que cumplen todos los filtros.

Un grupo sin publicaciones informa que no hay artículos o preventas en ese grupo. No crea productos de relleno ni permite reservar borradores.

Para nuevos productos, mantener la categoría del juego, la marca y las etiquetas Primera Era/Primer Bloque correctas. Los nombres y etiquetas de los formatos extendidos también son válidos.

La lógica está en `lib/catalog-sections.ts`, compartida por ambos catálogos. No requiere migraciones ni nuevas variables de entorno.

Pruebas: `tests/catalog-sections.test.ts` distingue formatos y accesorios compatibles; `tests/e2e/catalog-sections.spec.ts` comprueba ambos catálogos, búsqueda, selección en URL, regreso desde ficha, recarga, limpieza y celular. Las regresiones de Tienda y Preventas conservan las pruebas de precio, variantes, estado de reservas y filtros existentes.
