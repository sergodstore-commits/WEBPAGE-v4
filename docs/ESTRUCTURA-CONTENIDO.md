# Pauta estructural vigente — octubre de 2026

Esta pauta continúa las mejoras visuales, sin animaciones de banners. Los números corresponden a la propuesta estructural aceptada en el chat.

| Punto | Mejora                                   | Estado                                                                                                                                                                               | Modelo / razonamiento recomendado |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1     | Banlist permanente en Noticias           | Publicado: bloque independiente de los filtros, con TCG y avisos publicados de MyL.                                                                                                  | Sol 6.1 / Alto                    |
| 2     | Explorador de ediciones en Comunidad     | Publicado: guías disponibles, cartas ampliables y efectos en español; se reutilizan los archivos existentes.                                                                         | Sol 6.1 / Alto                    |
| 3     | Separar las áreas de Comunidad           | Completado junto al punto 2: accesos a Rankings y Explorar cartas, sin añadir una pestaña principal.                                                                                 | Sol 6.1 / Medio                   |
| 4     | Noticias por juego y tema                | Cuatro secciones: SERGOD STORE, Yu-Gi-Oh! TCG, MyL Primera Era y Primer Bloque. Temas con contadores, filtros en la URL, búsqueda y orden por fecha original. Banlist independiente. | Sol 6.1 / Medio                   |
| 5     | Conectar noticias, ediciones y productos | Pendiente: noticia → cartas y productos relacionados; explorador → productos de la edición. Una asociación compartida para todas las presentaciones.                                 | Sol 6.1 / Alto                    |
| 6     | Torneos con una entrada más útil         | Pendiente: próximos eventos antes del calendario, detalle con horario, formato, precio cuando corresponda, transmisión y resultados existentes.                                      | Sol 6.1 / Medio                   |
| 7     | Tienda por decisiones de compra          | Pendiente: juego/línea antes de presentación; cada sobre, display, token box, single y accesorio mantiene su artículo propio.                                                        | Sol 6.1 / Medio                   |
| 8     | Administración por contenido             | Pendiente: fuentes/actualizaciones separadas de revisión/publicación, progreso claro; ligas en su propia área.                                                                       | Sol 6.1 / Alto                    |

No contratar servicios ni duplicar imágenes por cambiar la organización. Los modelos son recomendaciones de trabajo, no cambios automáticos en la aplicación.

## Noticias: navegación

`/noticias?seccion={grupo}&categoria={tema}` conserva el tema al recargar y permite volver entre selecciones con el historial del navegador. Las categorías desconocidas se interpretan como Todas. Cambiar de grupo abre todas sus noticias y limpia la búsqueda local; cambiar de tema conserva esa búsqueda. Quitar filtros vuelve a Todas y limpia la búsqueda. Los contadores corresponden al grupo completo, no a la búsqueda, para mostrar qué contiene cada tema.

Las noticias web se ordenan por `published_on` descendente (fecha original), con identificador como desempate; Instagram mantiene `recorded_at` (fecha original de la publicación). No se usan fechas de importación. Las categorías siguen siendo las existentes: Actualidad, Revelaciones, Lanzamientos, Torneos y Banlist. SERGOD STORE conserva las publicaciones propias e Instagram sin inventar temas que su contenido no tiene clasificados.
