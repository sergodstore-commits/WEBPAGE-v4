# Pauta estructural vigente — octubre de 2026

Esta pauta continúa las mejoras visuales, sin animaciones de banners. Los números corresponden a la propuesta estructural aceptada en el chat.

| Punto | Mejora                                   | Estado                                                                                                                                                                               | Modelo / razonamiento recomendado |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1     | Banlist permanente en Noticias           | Publicado: tema Banlist abre la herramienta directa para TCG, Primera Era y Primer Bloque; sin acceso duplicado en Comunidad.                                                        | Sol 6.1 / Alto                    |
| 2     | Explorador de ediciones en Comunidad     | Publicado: guías disponibles, cartas ampliables y efectos en español; se reutilizan los archivos existentes.                                                                         | Sol 6.1 / Alto                    |
| 3     | Separar las áreas de Comunidad           | Completado junto al punto 2: accesos a Rankings y Explorar cartas, sin añadir una pestaña principal.                                                                                 | Sol 6.1 / Medio                   |
| 4     | Noticias por juego y tema                | Cuatro secciones: SERGOD STORE, Yu-Gi-Oh! TCG, MyL Primera Era y Primer Bloque. Temas con contadores, filtros en la URL, búsqueda y orden por fecha original. Banlist independiente. | Sol 6.1 / Medio                   |
| 5     | Conectar noticias, ediciones y productos | Completado: guías y noticias relacionadas → cartas y productos; explorador → guía y productos. Cada presentación conserva su ficha, precio e idioma.                                 | Sol 6.1 / Alto                    |
| 6     | Torneos con una entrada más útil         | Completado: seis próximas fechas antes del calendario, accesos a transmisión, grabaciones y resultados de liga; detalle con datos y descripción del evento.                          | Sol 6.1 / Medio                   |
| 7     | Tienda por decisiones de compra          | Completado: juego/línea → presentación, con contadores y filtros conservados en la URL; cada SKU conserva su tarjeta, precio y disponibilidad.                                       | Sol 6.1 / Medio                   |
| 8     | Administración por contenido             | Completado: biblioteca de noticias separada de consulta de fuentes; filtros por juego, estado y búsqueda; herramientas bajo demanda, con ligas en su propia área.                    | Sol 6.1 / Alto                    |

No contratar servicios ni duplicar imágenes por cambiar la organización. Los modelos son recomendaciones de trabajo, no cambios automáticos en la aplicación.

## Noticias: navegación

`/noticias?seccion={grupo}&categoria={tema}` conserva el tema al recargar y permite volver entre selecciones con el historial del navegador. Las categorías desconocidas se interpretan como Todas. Cambiar de grupo abre todas sus noticias y limpia la búsqueda local; cambiar de tema conserva esa búsqueda. Quitar filtros vuelve a Todas y limpia la búsqueda. Los contadores corresponden al grupo completo, no a la búsqueda, para mostrar qué contiene cada tema. El botón global «Banlists», encima de las secciones y fuera del recuadro de artículos, abre los tres formatos con `vista=banlists`. La herramienta puede permanecer abierta al cambiar de juego o tema; cerrar la herramienta conserva la selección de noticias. Recargar y el historial restauran su estado. Los enlaces anteriores con `categoria=banlist` siguen abriendo este acceso global.

Las noticias web se ordenan por `published_on` descendente (fecha original), con identificador como desempate; Instagram mantiene `recorded_at` (fecha original de la publicación). No se usan fechas de importación. Los temas públicos son Revelaciones y Lanzamientos, además de Todas. Actualidad y Torneos permanecen como clasificación de artículos administrados y son visibles en Todas, sin filtros propios. Banlists es una herramienta global independiente y excluye los avisos de restricciones de la cuadrícula de artículos. SERGOD STORE conserva las publicaciones propias e Instagram sin inventar temas que su contenido no tiene clasificados.

## Conexiones entre contenido y catálogo

Las guías y el explorador comparten el bloque «Cartas y productos de esta edición». Los productos se consultan únicamente al desplegarlo; se reutilizan sus imágenes existentes y cada presentación mantiene su precio, idioma y disponibilidad. Los artículos agotados siguen visibles, mientras los borradores y productos retirados quedan fuera. El listado respeta la fecha de lanzamiento del producto.

La asociación utiliza los campos de catálogo de cada producto (`catalog_group` / `catalog_name`), con los mismos criterios para enlazar producto → edición y edición → productos. No depende de palabras coincidentes en una descripción ni descarga contenido externo durante la visita.

En el editor de noticias, «Edición relacionada (opcional)» permite conectar un artículo con una biblioteca publicada de su juego y formato, tanto TCG como MyL. Al retirar una guía, su asociación se conserva para administración pero deja de mostrarse públicamente.

## Torneos: entrada y navegación

La cartelera muestra hasta seis fechas publicadas por comenzar, ordenadas por la hora real del evento. Consulta los siguientes 45 días; el calendario mantiene su consulta mensual independiente. Las programaciones semanales, excepciones y traslados siguen usando las fechas resueltas por la agenda existente. Los eventos que ya comenzaron salen de la cartelera; siguen consultables desde el calendario. La hora y el día se presentan en `America/Santiago`.

Cada tarjeta abre la ficha del evento, donde fecha, hora, lugar y precio se distinguen de la descripción con sus reglas y formato. Un precio ausente no genera un importe ni un aviso pendiente. Las transmisiones y grabaciones conservan su publicación administrada y el reproductor sin reproducción automática.

«Resultados de liga» enlaza al historial de la categoría elegida en Comunidad mediante `?ranking={grupo}&resultados=1#torneos-ranking`. El historial se abre cuando llegan sus datos, también al recargar el enlace. Se reutilizan los resultados publicados por la tienda; no se asocia un resultado o video a un evento solo por su nombre. Esta reorganización no crea imágenes ni copia datos de ligas.

## Tienda y Preventas: decisiones de compra

Primero se elige el juego o línea; después la presentación. Las opciones muestran el número de artículos del grupo, antes de aplicar búsqueda, precio o disponibilidad. Los formatos sin artículos se omiten, salvo si están seleccionados mediante un enlace. Cambiar de juego conserva una presentación compatible o la limpia si no existe en el nuevo grupo. `presentacion` se conserva al recargar y se elimina con Limpiar filtros. Los enlaces anteriores con `categoria` siguen funcionando.

La clasificación da prioridad a Formato/Presentación en opciones o especificaciones; después utiliza el nombre y la categoría. Nunca interpreta las descripciones, donde pueden mencionarse otros productos. Los productos sin formato reconocido quedan en Otros productos y siguen visibles en el catálogo completo. No se agrupan idiomas, sobres, displays ni token box. Se mantiene el orden por fecha de lanzamiento; no hay consultas nuevas ni imágenes duplicadas.

### Lanzamientos y presentaciones — 12 de octubre de 2026

Tienda abre con lanzamientos recientes primero; Preventas, con los más cercanos primero. Se puede invertir el orden y conservarlo en la URL al recargar. Los artículos sin fecha siempre van al final. En una misma fecha se mantiene cada edición junta, con singles, sobres, token box/mazos, displays y packs; español antes de inglés dentro de cada presentación. Cada SKU conserva su tarjeta y precio.

Se verificaron siete ediciones con las [fuentes oficiales registradas](../data/catalogs/release-dates-2026-10.json). Yu-Gi-Oh! utiliza el lanzamiento general TCG de América; MyL, el lanzamiento oficial de Chile. Se corrigieron 21 productos publicados y cinco borradores relacionados, además de la guía de Chaos Origins. Los accesorios sin fecha verificada permanecen sin fecha. Precios, stock, reservas, imágenes, estado y condiciones de preventa se comprobaron sin cambios.

En la revisión pública posterior se corrigió también el año escrito en las condiciones de entrega de los dos displays Immortal Phoenix: enero de 2027, en lugar de 2026. Se conservaron el día, la modalidad y el resto de sus condiciones.

Una presentación nueva sin fecha puede heredar la única fecha conocida de su grupo. Si hay fechas distintas, se deja sin fecha para revisión; una fecha explícita por idioma o región tiene prioridad. No modifica automáticamente otras presentaciones existentes. La validación impide lanzar una preventa antes del cierre de sus reservas. Las fechas de producto se entregan como día de calendario, sin convertirlas en instantes que puedan cambiar de día según el servidor. Las tres ediciones YGO verificadas también conservan su fecha oficial al volver a preparar sus guías.

## Comunidad: biblioteca MyL — 12 de octubre de 2026

Explorar cartas permite elegir Todos, Yu-Gi-Oh! TCG, MyL Primera Era y MyL Primer Bloque. Se reutiliza el índice de ediciones publicado: los borradores quedan fuera. Cada galería MyL se solicita solo al abrirla, muestra hasta 48 cartas por bloque y usa miniaturas; la imagen ampliada se descarga al pulsar una carta. Seleccionar una presentación conserva su identificador en la URL.

La biblioteca incorpora cuatro referencias verificadas del blog oficial: [Leyendas Primer Bloque 4.0](https://blog.myl.cl/leyendas-primer-bloque-4-0/) (320 cartas regulares y 80 del Set Clásico); [Leyendas Primera Era 4.0](https://blog.myl.cl/leyendas-pe-4-0/) (55 cartas mostradas de una colección anunciada de 400, contando su Set Clásico); [Relatos de Dominios de Ra](https://blog.myl.cl/relatos-de-dominios-de-ra/) (12 cartas fijas por cada uno de sus tres relatos); y [Leyendas de Ultratumba](https://blog.myl.cl/leyendas-de-ultratumba-primera-era/) (cinco revelaciones de Tinieblas y cinco de Abismo, de sus 24 cartas respectivas). La cobertura parcial es visible; no se publica como una lista completa.

Las promociones de reserva se consultan aparte de las cartas regulares y no cuentan para la cobertura de la colección. El contenido fijo, los sobres aleatorios y los beneficios condicionales se distinguen al elegir cada presentación. Cada producto publicado conserva su tarjeta, idioma, precio y stock; el vínculo abre la misma biblioteca y, cuando se identifica, su presentación correspondiente. Las noticias MyL pueden asociarse con una biblioteca del mismo formato.

Las habilidades se leen en la imagen oficial en español. La fuente no ofrece nombres o habilidades como texto para todas las imágenes: en esos casos se conserva una referencia de imagen buscable; no se inventan nombres, habilidades ni resultados de OCR. Los nombres presentes en la fuente se conservan. No se usa un traductor ni una IA para MyL.

Administración → Noticias → Guías de cartas → Mitos y Leyendas permite Actualizar contenido, pausar/reanudar, previsualizar, publicar y retirar. La actualización de la fuente prepara un borrador y una imagen por solicitud, conservando la versión pública hasta Publicar. La operación comprueba la lectura pública. Una consulta fallida conserva el avance y la publicación anterior. Las fuentes están registradas en código y no se admiten destinos arbitrarios.

Las imágenes se reutilizan por URL con Noticias y Banlists. Las nuevas imágenes MyL se comprimen a WebP de hasta 700 px, con miniatura de 220 px y un máximo conjunto de 160 KB por carta. La biblioteca tiene un límite de 75 MB, separado del presupuesto de 15 MB de Noticias; reutilizar un archivo no lo vuelve a cobrar ni a descargar. Se amplió el límite inicial de 60 MB después de medir los archivos reales, para conservar su legibilidad. Los índices y estados administrativos se calculan en PostgreSQL sin transmitir todas las cartas en cada lote; la lectura pública obtiene solo la versión publicada. No hay migraciones, servicios de pago, consultas externas por visita ni modificación del stock. Los borradores y cachés se excluyen de la configuración pública antes de salir de PostgreSQL.

## Comunidad: orden de las ligas — 12 de octubre de 2026

Primera Era, Primer Bloque y Yu-Gi-Oh! comparten la misma regla: puntos totales descendentes; a igualdad de puntos, más primeros puestos, luego segundos, terceros y siguientes. Si el perfil acumulado coincide, se comparan los standings de cada jugador del más reciente al más antiguo. Los resultados del mismo día se comparan por mejor puesto; no se inventa una hora ni se usa la fecha de importación.

Solo cuentan torneos seleccionados, no archivados y de la liga correspondiente. El ranking tiene puestos únicos y consecutivos, también dentro de las casas de Yu-Gi-Oh!, donde se mantiene la posición general. Buscar o paginar no renumera a los jugadores. Una igualdad deportiva completa conserva un orden estable por identidad interna y marca ambos puestos como provisionales (†); no publica identificadores ni atribuye un mejor resultado a ese orden. La explicación está plegada bajo el ranking y disponible también al seleccionar torneos en Administración.

El cálculo se realiza al consultar los resultados existentes, sin modificar sus puntos ni standings, sin migraciones ni almacenamiento nuevo. La auditoría previa de los 65 jugadores de las tres ligas comprobó puntos idénticos; encontró dos parejas con igualdad completa, señaladas como provisionales. Los resultados individuales de cada torneo mantienen su standing externo original.

## Administración: revisión y fuentes

Desde el 12 de octubre, Buscar novedades ofrece únicamente Revelaciones y Lanzamientos/contenido de productos. Yu-Gi-Oh! Meta se consulta por categorías TCG; se rechazan marcas, categorías o rutas OCG, torneos, ajustes de puntos y avisos de restricciones. Se reconocen anuncios de productos, sets completos, rarezas, cartas nuevas y revelaciones aunque `subCategory` sea nulo. No se usa el texto del artículo como criterio ni se descarga su galería durante la búsqueda.

MyL consulta Primera Era, Primer Bloque y sus categorías de productos; el título del formato prevalece sobre una etiqueta contradictoria. Se reconocen productos y revelaciones por metadatos y títulos; se excluyen banlists, torneos, juego organizado, oráculos, literatura y otros formatos. Una etiqueta de torneo no descarta por sí sola un producto: el blog usa ambas etiquetas en Relatos de Dominios de Ra. Los avisos de banlist se siguen consultando únicamente con su herramienta independiente. MyL no se envía al traductor.

La caché de búsqueda conserva los cinco minutos existentes y añade una versión de reglas. Una caché anterior se renueva antes de ofrecer resultados; preparar una selección antigua pide actualizar la búsqueda y no consume traducción ni descarga imágenes. Una consulta válida sin coincidencias muestra un resultado vacío y conserva todas las noticias guardadas. Un error de estructura o conexión conserva la selección anterior. Los artículos históricos permanecen editables y pueden actualizar su contenido; no se borran, retiran ni reclasifican automáticamente. La búsqueda usa como máximo las tres consultas de publicaciones MyL anteriores, reemplazando la de banlist por productos; no añade servicios de pago, tablas ni almacenamiento de imágenes.

Noticias web abre en Revisar y publicar: muestra los borradores y artículos publicados, con búsqueda por título/resumen, juego/formato y estado. Buscar y preparar conserva la consulta a Yu-Gi-Oh! Meta y MyL en otra vista; preparar abre automáticamente el borrador para revisarlo. La preparación y la publicación mantienen sus verificaciones existentes, mensajes de error y confirmación pública. MyL no necesita traducción; la traducción TCG conserva sus límites gratuitos actuales.

La vista de fuentes se enlaza con `paso=fuentes`; cada herramienta con `herramienta`. El historial permite volver entre vistas. Las herramientas se montan solo al abrirlas por primera vez y permanecen montadas para conservar ediciones y resultados al cambiar de sección. Mientras una herramienta prepara o guarda contenido, sus botones de navegación se deshabilitan. El progreso y Pausar preparación permanecen visibles también al preparar imágenes desde una noticia guardada. Recargar la página descarta las ediciones todavía sin guardar; los borradores guardados se conservan en el servidor.

Instagram mantiene su selección y su biblioteca guardada; Guías y Banlist conservan sus procesos independientes. Los accesos a ligas, contenido manual y Noticias públicas están arriba del espacio de trabajo. Esta organización no crea tablas, descargas ni servicios externos adicionales; evita cargar guías, banlist y conexión de Instagram al entrar solo a Noticias web.

## Banlists directas y contenido completo

Noticias → Banlists ofrece Yu-Gi-Oh! TCG, MyL Primera Era y Primer Bloque desde cualquier sección, incluida SERGOD STORE. La herramienta se carga al desplegarla; las listas completas se solicitan solo al abrir un formato. La herramienta TCG conserva su consulta existente de cartas, imágenes y efectos oficiales. MyL muestra las tablas completas de Racial Edición, búsqueda por carta/edición, límites y cambios; las ilustraciones oficiales están en Reglas y aclaraciones. La fuente MyL incluye ejemplos de excepciones, no imágenes de todas las cartas restringidas. No se inventan ni sustituyen esas imágenes. Este cambio de ubicación no descarga archivos nuevos ni modifica datos, fuentes o publicaciones.

En Administración → Noticias → Fuentes → Banlists, cada actualización MyL compara las dos listas base con los avisos generales posteriores y sus vigencias. El aviso más reciente prevalece sobre las tablas antiguas; los límites contradictorios no resueltos detienen la actualización. Una lista futura se mantiene separada hasta su vigencia. Se prepara una imagen por solicitud y solo se reemplaza la versión pública al finalizar. Una interrupción conserva el avance y la última lista completa. Las visitas públicas consultan la copia publicada, sin descargar fuentes externas.

La preparación de noticias ahora obtiene el contenido del artículo, no solo el extracto: secciones, condiciones, listas, tablas, documentos e imágenes en contexto. Los avisos generales MyL se reducen a cambios de Primera Era/Primer Bloque y fechas, sin saludos ni promoción. El editor permite «Actualizar contenido e imágenes» para revisar artículos antiguos; el texto escrito manualmente se conserva salvo al solicitar esa actualización expresamente.

MyL permanece en español. TCG traduce bloques con el servicio gratuito existente y conserva el progreso; un fallo o cuota agotada mantiene el borrador sin publicarlo. La traducción automática requiere revisión de nombres y efectos. Editar manualmente el cuerpo sustituye la versión estructurada y permite terminar la traducción en el panel. No se añade IA de pago.

Las imágenes se reutilizan por URL y se optimizan a WebP, hasta 160 KB por archivo y 15 MB para el conjunto de noticias/banlists MyL. Las cartas TCG conservan su caché separado existente. Los borradores y cachés MyL se excluyen de la configuración pública general.
