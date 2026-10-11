# Pauta estructural vigente — octubre de 2026

Esta pauta continúa las mejoras visuales, sin animaciones de banners. Los números corresponden a la propuesta estructural aceptada en el chat.

| Punto | Mejora                                   | Estado                                                                                                                                                                               | Modelo / razonamiento recomendado |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1     | Banlist permanente en Noticias           | Publicado: bloque independiente de los filtros, con TCG y avisos publicados de MyL.                                                                                                  | Sol 6.1 / Alto                    |
| 2     | Explorador de ediciones en Comunidad     | Publicado: guías disponibles, cartas ampliables y efectos en español; se reutilizan los archivos existentes.                                                                         | Sol 6.1 / Alto                    |
| 3     | Separar las áreas de Comunidad           | Completado junto al punto 2: accesos a Rankings y Explorar cartas, sin añadir una pestaña principal.                                                                                 | Sol 6.1 / Medio                   |
| 4     | Noticias por juego y tema                | Cuatro secciones: SERGOD STORE, Yu-Gi-Oh! TCG, MyL Primera Era y Primer Bloque. Temas con contadores, filtros en la URL, búsqueda y orden por fecha original. Banlist independiente. | Sol 6.1 / Medio                   |
| 5     | Conectar noticias, ediciones y productos | Completado: guías y noticias relacionadas → cartas y productos; explorador → guía y productos. Cada presentación conserva su ficha, precio e idioma.                                 | Sol 6.1 / Alto                    |
| 6     | Torneos con una entrada más útil         | Pendiente: próximos eventos antes del calendario, detalle con horario, formato, precio cuando corresponda, transmisión y resultados existentes.                                      | Sol 6.1 / Medio                   |
| 7     | Tienda por decisiones de compra          | Pendiente: juego/línea antes de presentación; cada sobre, display, token box, single y accesorio mantiene su artículo propio.                                                        | Sol 6.1 / Medio                   |
| 8     | Administración por contenido             | Pendiente: fuentes/actualizaciones separadas de revisión/publicación, progreso claro; ligas en su propia área.                                                                       | Sol 6.1 / Alto                    |

No contratar servicios ni duplicar imágenes por cambiar la organización. Los modelos son recomendaciones de trabajo, no cambios automáticos en la aplicación.

## Noticias: navegación

`/noticias?seccion={grupo}&categoria={tema}` conserva el tema al recargar y permite volver entre selecciones con el historial del navegador. Las categorías desconocidas se interpretan como Todas. Cambiar de grupo abre todas sus noticias y limpia la búsqueda local; cambiar de tema conserva esa búsqueda. Quitar filtros vuelve a Todas y limpia la búsqueda. Los contadores corresponden al grupo completo, no a la búsqueda, para mostrar qué contiene cada tema.

Las noticias web se ordenan por `published_on` descendente (fecha original), con identificador como desempate; Instagram mantiene `recorded_at` (fecha original de la publicación). No se usan fechas de importación. Las categorías siguen siendo las existentes: Actualidad, Revelaciones, Lanzamientos, Torneos y Banlist. SERGOD STORE conserva las publicaciones propias e Instagram sin inventar temas que su contenido no tiene clasificados.

## Conexiones entre contenido y catálogo

Las guías y el explorador comparten el bloque «Cartas y productos de esta edición». Los productos se consultan únicamente al desplegarlo; se reutilizan sus imágenes existentes y cada presentación mantiene su precio, idioma y disponibilidad. Los artículos agotados siguen visibles, mientras los borradores y productos retirados quedan fuera. El listado respeta la fecha de lanzamiento del producto.

La asociación utiliza los campos de catálogo de cada producto (`catalog_group` / `catalog_name`), con los mismos criterios para enlazar producto → edición y edición → productos. No depende de palabras coincidentes en una descripción ni descarga contenido externo durante la visita.

En el editor de noticias TCG, «Edición relacionada (opcional)» permite conectar un artículo con una guía publicada. Las noticias de MyL no ofrecen esta asociación mientras no exista un catálogo de ediciones MyL. Al retirar una guía, su asociación se conserva para administración pero deja de mostrarse públicamente.
