# Revisión estructural de SERGOD STORE — 12 de octubre de 2026

Estado: diagnóstico y propuesta. Esta revisión no aplica cambios al sitio ni a los rankings.

## Hallazgos comprobados

- Se revisaron Tienda, Preventas, Comunidad/Explorar cartas, Torneos y el panel de Noticias publicados, además del código correspondiente.
- El catálogo público contiene 83 productos: 79 en Tienda y 4 en Preventas. Solo 6 tienen `release_date`: las presentaciones de Chaos Origins. Los otros 15 productos de cartas y los 62 accesorios no tienen esa fecha.
- Tanto servidor como catálogo público ya ordenan por fecha de lanzamiento; al faltar fechas, se termina utilizando el nombre. El panel administrativo sí ordena por creación. El fallo público no se resuelve cambiando únicamente la etiqueta del selector.
- Las cuatro preventas carecen de fecha de lanzamiento. La migración automática a Tienda requiere esa fecha, cierre de reserva alcanzado, opción automática activada y stock disponible. La fecha de publicación del anuncio no sustituye a la de lanzamiento.
- Los rankings acumulados asignan puestos compartidos mediante `dense_rank()` por puntos. Dentro de un empate, la lista se presenta por nombre. El standing de cada torneo se guarda, pero no desempata la liga.
- El explorador y la asociación producto/guía solo contemplan Yu-Gi-Oh!; no existe todavía una biblioteca de productos/cartas MyL.
- Banlist está dentro del selector de temas de cada juego aunque abre una herramienta que incluye los tres formatos.
- Torneos coloca seis próximos eventos antes de la transmisión y luego reparte el espacio entre calendario y directo a partes iguales.
- Administración mezcla Noticias, Instagram, guías y banlists bajo Noticias; el directo se configura en Integraciones y el archivo se gestiona en Transmisiones.
- Hay instrucciones y estados obsoletos: se anuncia que solo se prepara título/resumen aunque el importador ya obtiene contenido completo; la guía estática de Beyond the Brave puede aparecer como «imágenes sin preparar» pese a estar publicada. Una banlist publicada como artículo tampoco aparece en la cuadrícula pública, por decisión de diseño.

## Orden y presentación del catálogo

Tienda: lanzamiento real descendente; misma fecha → edición/producto → presentación → idioma. Cada SKU mantiene tarjeta, precio y stock propios. Presentaciones sugeridas: single, sobre, kit/token box, display y pack promocional. No agruparlos en una tarjeta ni mostrar rangos de precio.

Preventas: fecha de lanzamiento más cercana primero, con opción de invertir el orden. Distinguir lanzamiento, cierre de reserva y entrega estimada. Los productos sin fecha deben señalarse como pendientes en administración; no inventar fechas. Los accesorios se ordenan por tipo y nombre cuando no tienen lanzamiento pertinente.

La fecha debería administrarse una vez en el registro de edición/producto y reutilizarse en sus presentaciones compatibles, con excepciones para idiomas/regiones o productos especiales que tengan lanzamiento distinto.

Visualmente: conservar banners completos y estáticos. Acercar filtros y catálogo al banner reduciendo separaciones y rótulos repetidos. Juego/línea y presentación deben ser las elecciones principales. Ocultar en «Más filtros» precio e idioma; eliminar duplicidades de Categoría/Marca cuando repiten el juego ya elegido. Usar filtros laterales específicos para accesorios, sin mezclar etiquetas editoriales como «Destacado» o «Nuevo 2026» con atributos de compra.

Las tarjetas necesitan una superficie ligera, imagen en área uniforme, nombre legible, presentación/idioma, precio, disponibilidad y acción principal. Reducir el bloque repetido «Herramienta de Comunidad · Cartas y efectos» a «Ver contenido». Evitar recuadros dentro de otros recuadros; separar las secciones principales mediante alineación, títulos, espacio y líneas discretas.

## Comunidad y contenido de productos

Mantener Rankings y Explorar cartas. En el explorador añadir Yu-Gi-Oh! TCG, MyL Primera Era y MyL Primer Bloque. Permitir buscar tanto edición como kit/producto.

Una única biblioteca alimenta Comunidad, la ficha del producto y las noticias relacionadas. La noticia contextualiza el lanzamiento y enlaza a esa biblioteca; no almacena una segunda galería idéntica.

Separar siempre:

1. Cartas fijas: nombres, versión y cantidades confirmadas.
2. Sobres: cantidad incluida y colección de cartas que pueden salir.
3. Promociones/Buy a Box: condiciones de reserva, contenido fijo o al azar.

No presentar toda una edición como contenido garantizado de una caja o toolkit. Una publicación parcial de revelaciones tampoco prueba que exista una lista completa. Mostrar cobertura confirmada y conservar la fuente de cada producto.

El blog oficial ya publica ejemplos útiles: [Toolkit Primera Era 2026](https://blog.myl.cl/nuevas-toolkit-primera-era-2026/) y [Relatos de Dominios de Ra](https://blog.myl.cl/relatos-de-dominios-de-ra/), con imágenes y distinción entre cartas, sobres y beneficios de reserva. Hay que verificar cada referencia concreta del catálogo antes de publicar su contenido completo.

## Puestos únicos en las ligas

En cada torneo se respeta el standing final de Konami/TOR. Para una liga que suma varios torneos no existe un único standing externo que determine automáticamente su desempate.

Regla confirmada y aplicada: puntos acumulados → más primeros puestos → más segundos puestos → siguientes posiciones → standings de cada jugador, del más reciente al más antiguo. Los torneos de un mismo día se comparan por mejor puesto, porque los reportes no ofrecen una cronología fiable dentro de ese día. No se usan el nombre ni la fecha de importación como mérito deportivo.

Los puestos son únicos y consecutivos. Si todos los criterios deportivos coinciden, se conserva un orden estable por identidad interna, marcado como provisional (†), sin publicar esa identidad ni atribuir superioridad deportiva. Las casas de Yu-Gi-Oh! conservan los puestos generales. La regla se puede consultar tanto en Comunidad como en la selección administrativa de las tres ligas. No se modifican puntos ni standings originales, ni se crea un mecanismo de desempate manual.

## Noticias y Banlists

Barra superior de Noticias: título y acceso global «Banlists» con icono, fuera del bloque de artículos. Debajo: SERGOD STORE, Yu-Gi-Oh! TCG, MyL Primera Era y MyL Primer Bloque. El acceso global abre los tres formatos y sus vigencias, independientemente de la sección activa. Implementado el 12 de octubre: herramienta desplegable independiente, filtros de artículos sin Banlist y compatibilidad con enlaces anteriores. Conserva búsquedas, cartas, vigencias y consultas bajo demanda, sin almacenamiento adicional. La selección editorial se completó en el paso siguiente.

En las secciones de juegos, la línea editorial solicitada pasa a Revelaciones y contenido de productos. Banlist es una herramienta separada. Implementado el 12 de octubre: las búsquedas TCG y MyL limitan los candidatos a esos temas, conservando fechas originales, caché y selección manual. Se invalidan cachés de reglas anteriores antes de preparar novedades; los artículos históricos siguen editables. La verificación de fuentes reales encontró 24 candidatos TCG y 16 MyL en la consulta del día, sin descargar imágenes. Los detalles y límites están en `ESTRUCTURA-CONTENIDO.md`.

Recomendación: tarjetas de noticia de altura comparable, resumen breve, fecha original, formato y acceso a lectura. Quitar el gran contenedor exterior de toda la cuadrícula y conservar bordes sutiles solo en cada artículo. El editor debe mostrar destino público y estado real de preparación/publicación.

## Torneos y transmisión

Orden propuesto: transmisión principal → próximas fechas compactas/calendario → resultados y grabaciones. El directo necesita el ancho principal, con formato 16:9; el calendario debe ser secundario o ir debajo. En móvil, directo primero.

Con transmisión activa: distintivo En vivo, título, reproductor y vínculo al torneo correspondiente cuando esté asociado. Sin transmisión activa: mostrar próxima emisión confirmada; si no existe, ofrecer la última grabación publicada y el canal. No anunciar un directo como activo solo porque exista una URL ni descargar videos al almacenamiento de la tienda.

Conservar el banner completo. Cuando haya directo, priorizar su acceso inmediato; se puede estudiar un banner desplegable en ese estado, sin recortar la ilustración.

## Administración por tarea

| Área                  | Trabajo habitual                                               | Fuente                                                        |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Noticias              | Actualizar novedades, seleccionar, revisar y publicar          | Yu-Gi-Oh! Meta, blog MyL, Instagram; X pendiente              |
| Biblioteca de cartas  | Incorporar productos/ediciones, verificar cartas y asociar SKU | Fuentes YGO existentes y contenidos oficiales MyL verificados |
| Banlists              | Actualizar listas completas y revisar vigencias                | Konami y blog oficial MyL                                     |
| Ligas                 | Importar resultados y elegir torneos que suman                 | Konami mediante complemento y TOR                             |
| Torneos/Transmisiones | Calendario, emisión activa y archivo                           | Agenda propia y YouTube                                       |
| Configuración/Fuentes | Conexiones, permisos y diagnóstico                             | Cuentas y conectores existentes                               |

Las acciones de actualizar permanecen dentro del área donde se trabaja. Un estado central de fuentes puede ser útil, pero no debe obligar a ir y volver para cada operación. Evitar un botón universal que descargue todo.

Flujo de noticias: Actualizar novedades → seleccionar y abrir vista previa (la preparación automática conserva su progreso) → Publicar. Reutilizar los borradores y las imágenes existentes. El contenido ya preparado abre directamente su vista previa. Mantener revisión de traducciones TCG y no enviar MyL al traductor.

Ligas y banlists mantienen flujos propios: importar un torneo no equivale a incluirlo en puntos; consultar una fuente no equivale a publicar una noticia; actualizar una banlist completa no requiere redactar un artículo. Usar estados coherentes: Nuevo, Preparando, Listo para revisar, Publicado y Error, con explicación de qué falta y un único botón principal contextual.

## Nueva fuente: YGOrganization en X

[Perfil solicitado](https://x.com/ygorganization). Añadido a la propuesta para una fase posterior. Solo TCG; detectar publicaciones repetidas entre fuentes y separar publicación en X, anuncio de producto y fecha real de lanzamiento. La consulta automatizada del perfil devolvió 403 durante esta revisión; todavía no está comprobado un mecanismo gratuito de incorporación. No se ha conectado ni importado contenido desde X.

## Secuencia de ejecución

Avance del 12 de octubre: completada la corrección de fechas y el orden de Tienda/Preventas (21 productos publicados y cinco borradores relacionados), junto con los desempates y puestos únicos de las tres ligas. También se implementó la biblioteca compartida MyL para cuatro referencias oficiales, con cobertura explícita, contenido por presentación y actualización administrativa. Se separó el acceso global a Banlists en Noticias y se ajustó la selección editorial de novedades. Las fuentes y el comportamiento están documentados en `ESTRUCTURA-CONTENIDO.md`. Sigue compactar la composición de Noticias y dar prioridad al directo de Torneos.

1. Corregir fechas y acordar desempates: afectan al orden real y a la confianza en resultados.
2. Definir la biblioteca compartida y los destinos administrativos, antes de añadir más importadores.
3. Incorporar productos/cartas de MyL y conectarlos con Tienda/Preventas y Comunidad.
4. Separar Banlists y ajustar la selección editorial de Noticias.
5. Dar prioridad al directo y compactar la agenda.
6. Aplicar la organización del panel y sus estados; retirar instrucciones y accesos redundantes.
7. Incorporar X después de comprobar lectura gratuita y deduplicación.

Los cambios de composición se pueden realizar con CSS y los recursos existentes. Las nuevas cartas sí aumentan el almacenamiento: preparar solo lo seleccionado, reutilizar imágenes y medir el presupuesto antes de ampliar la biblioteca MyL. El proyecto gratuito no implica consumo cero, pero tampoco exige descargar videos, duplicar galerías o añadir una IA de pago.
