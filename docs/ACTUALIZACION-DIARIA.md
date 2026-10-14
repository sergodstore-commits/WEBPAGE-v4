# Noticias y banlists: actualización diaria

El cron de producción llama a `/api/cron/content` cada día a las 10:00 UTC. Vercel Hobby puede ejecutarlo hasta 59 minutos después: entre las 07:00 y 07:59 en verano, o entre las 06:00 y 06:59 en invierno en Santiago. No depende de visitas, del PC ni de Codex abierto.

Fuentes existentes: Yu-Gi-Oh! Meta (TCG) y YGOrganization (TCG y OCG identificados), blog oficial MyL (Primera Era y Primer Bloque), banlist oficial Konami en español y banlists oficiales MyL. Los filtros editoriales incluyen revelaciones y contenido de productos, además de erratas verificadas de YGOrganization. Instagram mantiene su flujo editorial independiente.

YGOrganization consulta directamente tres páginas de `https://ygorganization.com/category/news/new-cards` y tres del listado filtrado `errata`, `f-and-l` y `ocg-tcg`: hasta 120 entradas antes de deduplicar, con caché de cinco minutos. Las noticias se identifican como TCG u OCG; los anuncios sin etiqueta requieren comprobar el cuerpo o un enlace oficial. Se verifican hasta seis artículos por búsqueda, empezando por los nunca comprobados y más recientes. Los fallos de red no se guardan como exclusiones. Se excluyen Rush Duel, Master Duel y Duel Links. Si falla uno de los listados, se conserva el resultado del otro. Las banlists mantienen su herramienta oficial independiente (Yu-Gi-Oh! TCG). La búsqueda no descarga imágenes.

Este es un seguimiento de novedades recientes, no una importación de todo el archivo histórico de New Cards. Las veinte noticias públicas de Yu-Gi-Oh! se comparten entre TCG y OCG; las cuotas gratuitas, la verificación de formato y la descarga completa pueden dejar novedades pendientes para otros días. No se garantiza publicar todos los artículos de la fuente ni el mismo día.

Las noticias nuevas se preparan, traducen cuando corresponde, descargan sus imágenes optimizadas y se publican únicamente cuando están completas. MyL no pasa por el traductor. Un fallo de una fuente no detiene las otras. Los borradores manuales preexistentes no se publican automáticamente.

El panel muestra publicaciones y pendientes por formato, avance de imágenes/traducción y errores por noticia. En la sección de recuperación, un administrador puede reanudar excepcionalmente un día parcial sin esperar al siguiente. La recuperación conserva la cuota diaria, excluye ejecuciones simultáneas y nunca repite un día completado. También puede incorporar borradores completos anteriores a la automatización si vuelven a aparecer en la fuente, conservan su título original y tienen texto español e imágenes verificados; los trabajos retirados no se recuperan. El cron normal sigue siendo una ejecución diaria. La ruta de recuperación exige sesión administrativa, mismo origen y producción, con un máximo de tres intentos por hora.

## Límites y continuidad

- Máximo público de 20 noticias Yu-Gi-Oh! y 10 MyL, sumando ambos formatos MyL. Las guías de ediciones también cuentan en el listado público, pero siguen disponibles en Explorar cartas.
- Orden por fecha original de publicación/lanzamiento. Los registros de URLs procesadas evitan reimportar noticias retiradas.
- Cuota automática de traducción: 4.500 caracteres diarios, conservadora respecto al servicio gratuito MyMemory. Las unidades traducidas se guardan; artículos largos pueden necesitar varios días. La traducción automática no equivale a una revisión humana especializada.
- Se mantienen los presupuestos de almacenamiento existentes. Alcanzarlos detiene descargas y deja el motivo en el panel; nunca se contrata un plan ni se activa una API de pago.
- Función Node.js con máximo 300 segundos; trabajo acotado con continuación al día siguiente. Fluid Compute debe estar habilitado.
- Las noticias MyL comparten hasta 90 segundos por ejecución, repartidos entre Primera Era y Primer Bloque cuando ambos tienen pendientes. Una galería grande no monopoliza ambos formatos; el tiempo sin usar se cede al siguiente grupo. Yu-Gi-Oh! dispone de hasta 60 segundos, siempre dentro del plazo total existente.
- La clave `CRON_SECRET` autoriza únicamente el cron. Las páginas públicas y las visitas nunca disparan importaciones. Los despliegues de vista previa no pueden ejecutarlo.

## Conservación de cartas

Al retirar una noticia, sus imágenes interiores y bloques con información quedan en `news_card_archives`, sin duplicar archivos. También se conservan portadas de revelaciones y portadas de origen incierto. Las bibliotecas, productos y banlists no se eliminan.

La limpieza solo elimina portadas propias, horizontales, con metadatos conocidos y sin referencias en noticias, galerías conservadas, productos, publicaciones, bibliotecas, banlists o archivos registrados. Los archivos desconocidos se conservan. Supabase Storage se limpia mediante su API, y la cuota se reduce únicamente tras confirmar la eliminación. No se borra directamente su tabla de objetos.

Conservar cartas implica que su colección puede seguir creciendo aunque haya solo 30 noticias visibles. El límite editorial no es un límite de almacenamiento total.

## Operación

Aplicar `019_daily_content.sql` antes de desplegar; no modifica tablas comerciales. El panel Noticias muestra la última ejecución, publicaciones y pendientes. `content_daily_runs` conserva 90 días de resultados; `content_news_jobs` conserva URLs procesadas y avance; una exclusión temporal impide ejecuciones solapadas incluso al cambiar de día. Si una ejecución termina abruptamente, el progreso queda disponible para la siguiente.

Cambiar fuentes o políticas requiere revisar sus parsers y pruebas. No publicar artículos incompletos para ocultar fallos de la fuente o del traductor.

## Cartas sin versión oficial en español

Al preparar una carta se consulta primero Konami. Si no hay texto español utilizable, se toma el efecto inglés verificado de YGOPRODeck y se traduce con el mismo servicio gratuito. Se conserva el inglés, se comprueba que los números coincidan y se guarda la traducción una sola vez junto a la carta. La ficha muestra un recuadro de traducción no oficial junto a la imagen, con acceso al texto inglés original. Esta operación no vuelve a traducir en cada visita ni duplica imágenes.

La falta de una ficha española deja de bloquear una edición cuando existe un efecto inglés verificable y una traducción válida. Si falta también el original, cambia la identidad, no coinciden los números o falla el traductor, se conserva el avance y no se inventa un efecto. Las traducciones usadas por la actualización diaria comparten su presupuesto de 4.500 caracteres.
