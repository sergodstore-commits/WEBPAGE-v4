# Pauta estructural vigente — octubre de 2026

Esta pauta continúa las mejoras visuales, sin animaciones de banners. Los números corresponden a la propuesta estructural aceptada en el chat.

| Punto | Mejora                                   | Estado                                                                                                                                                                               | Modelo / razonamiento recomendado |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1     | Banlist permanente en Noticias           | Publicado: bloque independiente de los filtros, con TCG y avisos publicados de MyL.                                                                                                  | Sol 6.1 / Alto                    |
| 2     | Explorador de ediciones en Comunidad     | Publicado: guías disponibles, cartas ampliables y efectos en español; se reutilizan los archivos existentes.                                                                         | Sol 6.1 / Alto                    |
| 3     | Separar las áreas de Comunidad           | Completado junto al punto 2: accesos a Rankings y Explorar cartas, sin añadir una pestaña principal.                                                                                 | Sol 6.1 / Medio                   |
| 4     | Noticias por juego y tema                | Cuatro secciones: SERGOD STORE, Yu-Gi-Oh! TCG, MyL Primera Era y Primer Bloque. Temas con contadores, filtros en la URL, búsqueda y orden por fecha original. Banlist independiente. | Sol 6.1 / Medio                   |
| 5     | Conectar noticias, ediciones y productos | Completado: guías y noticias relacionadas → cartas y productos; explorador → guía y productos. Cada presentación conserva su ficha, precio e idioma.                                 | Sol 6.1 / Alto                    |
| 6     | Torneos con una entrada más útil         | Completado: seis próximas fechas antes del calendario, accesos a transmisión, grabaciones y resultados de liga; detalle con datos y descripción del evento.                          | Sol 6.1 / Medio                   |
| 7     | Tienda por decisiones de compra          | Completado: juego/línea → presentación, con contadores y filtros conservados en la URL; cada SKU conserva su tarjeta, precio y disponibilidad.                                       | Sol 6.1 / Medio                   |
| 8     | Administración por contenido             | Completado: biblioteca de noticias separada de consulta de fuentes; filtros por juego, estado y búsqueda; herramientas bajo demanda, con ligas en su propia área.                    | Sol 6.1 / Alto                    |

No contratar servicios ni duplicar imágenes por cambiar la organización. Los modelos son recomendaciones de trabajo, no cambios automáticos en la aplicación.

## Noticias: navegación

`/noticias?seccion={grupo}&categoria={tema}` conserva el tema al recargar y permite volver entre selecciones con el historial del navegador. Las categorías desconocidas se interpretan como Todas. Cambiar de grupo abre todas sus noticias y limpia la búsqueda local; cambiar de tema conserva esa búsqueda. Quitar filtros vuelve a Todas y limpia la búsqueda. Los contadores corresponden al grupo completo, no a la búsqueda, para mostrar qué contiene cada tema.

Las noticias web se ordenan por `published_on` descendente (fecha original), con identificador como desempate; Instagram mantiene `recorded_at` (fecha original de la publicación). No se usan fechas de importación. Las categorías siguen siendo las existentes: Actualidad, Revelaciones, Lanzamientos, Torneos y Banlist. SERGOD STORE conserva las publicaciones propias e Instagram sin inventar temas que su contenido no tiene clasificados.

## Conexiones entre contenido y catálogo

Las guías y el explorador comparten el bloque «Cartas y productos de esta edición». Los productos se consultan únicamente al desplegarlo; se reutilizan sus imágenes existentes y cada presentación mantiene su precio, idioma y disponibilidad. Los artículos agotados siguen visibles, mientras los borradores y productos retirados quedan fuera. El listado respeta la fecha de lanzamiento del producto.

La asociación utiliza los campos de catálogo de cada producto (`catalog_group` / `catalog_name`), con los mismos criterios para enlazar producto → edición y edición → productos. No depende de palabras coincidentes en una descripción ni descarga contenido externo durante la visita.

En el editor de noticias TCG, «Edición relacionada (opcional)» permite conectar un artículo con una guía publicada. Las noticias de MyL no ofrecen esta asociación mientras no exista un catálogo de ediciones MyL. Al retirar una guía, su asociación se conserva para administración pero deja de mostrarse públicamente.

## Torneos: entrada y navegación

La cartelera muestra hasta seis fechas publicadas por comenzar, ordenadas por la hora real del evento. Consulta los siguientes 45 días; el calendario mantiene su consulta mensual independiente. Las programaciones semanales, excepciones y traslados siguen usando las fechas resueltas por la agenda existente. Los eventos que ya comenzaron salen de la cartelera; siguen consultables desde el calendario. La hora y el día se presentan en `America/Santiago`.

Cada tarjeta abre la ficha del evento, donde fecha, hora, lugar y precio se distinguen de la descripción con sus reglas y formato. Un precio ausente no genera un importe ni un aviso pendiente. Las transmisiones y grabaciones conservan su publicación administrada y el reproductor sin reproducción automática.

«Resultados de liga» enlaza al historial de la categoría elegida en Comunidad mediante `?ranking={grupo}&resultados=1#torneos-ranking`. El historial se abre cuando llegan sus datos, también al recargar el enlace. Se reutilizan los resultados publicados por la tienda; no se asocia un resultado o video a un evento solo por su nombre. Esta reorganización no crea imágenes ni copia datos de ligas.

## Tienda y Preventas: decisiones de compra

Primero se elige el juego o línea; después la presentación. Las opciones muestran el número de artículos del grupo, antes de aplicar búsqueda, precio o disponibilidad. Los formatos sin artículos se omiten, salvo si están seleccionados mediante un enlace. Cambiar de juego conserva una presentación compatible o la limpia si no existe en el nuevo grupo. `presentacion` se conserva al recargar y se elimina con Limpiar filtros. Los enlaces anteriores con `categoria` siguen funcionando.

La clasificación da prioridad a Formato/Presentación en opciones o especificaciones; después utiliza el nombre y la categoría. Nunca interpreta las descripciones, donde pueden mencionarse otros productos. Los productos sin formato reconocido quedan en Otros productos y siguen visibles en el catálogo completo. No se agrupan idiomas, sobres, displays ni token box. Se mantiene el orden por fecha de lanzamiento; no hay consultas nuevas ni imágenes duplicadas.

## Administración: revisión y fuentes

Noticias web abre en Revisar y publicar: muestra los borradores y artículos publicados, con búsqueda por título/resumen, juego/formato y estado. Buscar y preparar conserva la consulta a Yu-Gi-Oh! Meta y MyL en otra vista; preparar abre automáticamente el borrador para revisarlo. La preparación y la publicación mantienen sus verificaciones existentes, mensajes de error y confirmación pública. MyL no necesita traducción; la traducción TCG conserva sus límites gratuitos actuales.

La vista de fuentes se enlaza con `paso=fuentes`; cada herramienta con `herramienta`. El historial permite volver entre vistas. Las herramientas se montan solo al abrirlas por primera vez y permanecen montadas para conservar ediciones y resultados al cambiar de sección. Mientras una herramienta prepara o guarda contenido, sus botones de navegación se deshabilitan. El progreso y Pausar preparación permanecen visibles también al preparar imágenes desde una noticia guardada. Recargar la página descarta las ediciones todavía sin guardar; los borradores guardados se conservan en el servidor.

Instagram mantiene su selección y su biblioteca guardada; Guías y Banlist conservan sus procesos independientes. Los accesos a ligas, contenido manual y Noticias públicas están arriba del espacio de trabajo. Esta organización no crea tablas, descargas ni servicios externos adicionales; evita cargar guías, banlist y conexión de Instagram al entrar solo a Noticias web.
