# Noticias y banlists: actualización diaria

El cron de producción llama a `/api/cron/content` cada día a las 10:00 UTC. Vercel Hobby puede ejecutarlo hasta 59 minutos después: entre las 07:00 y 07:59 en verano, o entre las 06:00 y 06:59 en invierno en Santiago. No depende de visitas, del PC ni de Codex abierto.

Fuentes existentes: Yu-Gi-Oh! Meta y YGOrganization (sitios web, solo TCG), blog oficial MyL (Primera Era y Primer Bloque), banlist oficial Konami en español y banlists oficiales MyL. Los filtros editoriales incluyen revelaciones y contenido de productos, además de erratas TCG verificadas de YGOrganization. Instagram mantiene su flujo editorial independiente.

YGOrganization consulta tres páginas (hasta 60 publicaciones) de las categorías `errata`, `f-and-l` y `ocg-tcg`, con caché de cinco minutos. Las banlists mantienen su herramienta oficial independiente. Para anuncios sin etiqueta TCG se verifica el cuerpo del artículo y sus enlaces oficiales: hasta seis verificaciones por búsqueda, priorizando productos y reediciones. Los resultados de formato se conservan siete días, con un máximo de 120 registros privados. Los códigos japoneses, Asian English y Rush Duel se excluyen; un fallo de verificación deja el artículo pendiente sin descartar las otras novedades. La búsqueda no descarga imágenes.

Las noticias nuevas se preparan, traducen cuando corresponde, descargan sus imágenes optimizadas y se publican únicamente cuando están completas. MyL no pasa por el traductor. Un fallo de una fuente no detiene las otras. Los borradores manuales preexistentes no se publican automáticamente.

El panel muestra publicaciones y pendientes por formato, avance de imágenes/traducción y errores por noticia. En la sección de recuperación, un administrador puede reanudar excepcionalmente un día parcial sin esperar al siguiente. La recuperación conserva la cuota diaria, excluye ejecuciones simultáneas y nunca repite un día completado. También puede incorporar borradores completos anteriores a la automatización si vuelven a aparecer en la fuente, conservan su título original y tienen texto español e imágenes verificados; los trabajos retirados no se recuperan. El cron normal sigue siendo una ejecución diaria. La ruta de recuperación exige sesión administrativa, mismo origen y producción, con un máximo de tres intentos por hora.

## Límites y continuidad

- Máximo público de 10 noticias Yu-Gi-Oh! y 10 MyL, sumando ambos formatos MyL. Las guías de ediciones también cuentan en el listado público, pero siguen disponibles en Explorar cartas.
- Orden por fecha original de publicación/lanzamiento. Los registros de URLs procesadas evitan reimportar noticias retiradas.
- Cuota automática de traducción: 4.500 caracteres diarios, conservadora respecto al servicio gratuito MyMemory. Las unidades traducidas se guardan; artículos largos pueden necesitar varios días. La traducción automática no equivale a una revisión humana especializada.
- Se mantienen los presupuestos de almacenamiento existentes. Alcanzarlos detiene descargas y deja el motivo en el panel; nunca se contrata un plan ni se activa una API de pago.
- Función Node.js con máximo 300 segundos; trabajo acotado con continuación al día siguiente. Fluid Compute debe estar habilitado.
- La clave `CRON_SECRET` autoriza únicamente el cron. Las páginas públicas y las visitas nunca disparan importaciones. Los despliegues de vista previa no pueden ejecutarlo.

## Conservación de cartas

Al retirar una noticia, sus imágenes interiores y bloques con información quedan en `news_card_archives`, sin duplicar archivos. También se conservan portadas de revelaciones y portadas de origen incierto. Las bibliotecas, productos y banlists no se eliminan.

La limpieza solo elimina portadas propias, horizontales, con metadatos conocidos y sin referencias en noticias, galerías conservadas, productos, publicaciones, bibliotecas, banlists o archivos registrados. Los archivos desconocidos se conservan. Supabase Storage se limpia mediante su API, y la cuota se reduce únicamente tras confirmar la eliminación. No se borra directamente su tabla de objetos.

Conservar cartas implica que su colección puede seguir creciendo aunque haya solo 20 noticias visibles. El límite editorial no es un límite de almacenamiento total.

## Operación

Aplicar `019_daily_content.sql` antes de desplegar; no modifica tablas comerciales. El panel Noticias muestra la última ejecución, publicaciones y pendientes. `content_daily_runs` conserva 90 días de resultados; `content_news_jobs` conserva URLs procesadas y avance; una exclusión temporal impide ejecuciones solapadas incluso al cambiar de día. Si una ejecución termina abruptamente, el progreso queda disponible para la siguiente.

Cambiar fuentes o políticas requiere revisar sus parsers y pruebas. No publicar artículos incompletos para ocultar fallos de la fuente o del traductor.

## Cartas sin versión oficial en español

Al preparar una carta se consulta primero Konami. Si no hay texto español utilizable, se toma el efecto inglés verificado de YGOPRODeck y se traduce con el mismo servicio gratuito. Se conserva el inglés, se comprueba que los números coincidan y se guarda la traducción una sola vez junto a la carta. La ficha muestra un recuadro de traducción no oficial junto a la imagen, con acceso al texto inglés original. Esta operación no vuelve a traducir en cada visita ni duplica imágenes.

La falta de una ficha española deja de bloquear una edición cuando existe un efecto inglés verificable y una traducción válida. Si falta también el original, cambia la identidad, no coinciden los números o falla el traductor, se conserva el avance y no se inventa un efecto. Las traducciones usadas por la actualización diaria comparten su presupuesto de 4.500 caracteres.
