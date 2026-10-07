# Noticias e Instagram

Fase 4 incluida en la entrega final del 7 de octubre, con la migración 010 aplicada. Por decisión del propietario la cuenta real se conectará después de publicar; no se importó contenido de producción y no se considera probada la conexión real.

## Noticias públicas

`/noticias` muestra la publicación más reciente aprobada en un visor principal. Admite imagen, carrusel mixto de fotos/videos y video/Reel MP4 con controles, sin reproducción automática. El carrusel admite flechas, teclado y swipe horizontal sin capturar el desplazamiento vertical. Solo se monta el video seleccionado; las tarjetas anteriores muestran miniaturas.

Seleccionar una noticia anterior la lleva al visor, actualiza `?publicacion=ID`, desplaza hacia él y le devuelve el foco. Recargar conserva la selección. Hay nueve tarjetas iniciales y **Ver más noticias**. Los errores y archivos no disponibles ofrecen recuperación o acceso a la publicación original.

El caption sirve como texto. No se exige título, resumen ni artículo. Se elimina solamente el hashtag técnico configurado; los demás hashtags se conservan. Las noticias manuales ya publicadas y sus páginas de detalle siguen accesibles. La portada incluye también las noticias importadas y enlaza al visor de Noticias.

## Cuenta e importación

Se eligió **Instagram API with Instagram Login** para una cuenta profesional propia (Business o Creator), sin exigir una página Facebook vinculada. Esta modalidad y los nombres actuales de permisos están descritos en la [colección oficial de Meta](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login). El código solicita únicamente `instagram_business_basic`: lee medios propios, sin publicar en Instagram, gestionar comentarios ni mensajes.

**Admin → Integraciones → Instagram** muestra conexión, cuenta, expiración y callback. El hashtag inicial es `SergodWeb`; puede cambiarse con **Guardar hashtag**. Se admite escribirlo con o sin `#`, sin espacios. Cambiarlo invalida vistas previas pendientes, pero conserva noticias existentes.

**Revisar Instagram** consulta 25 medios de la cuenta conectada por página. Filtra por hashtag completo, sin distinguir mayúsculas: `#SergodWebExtra` no coincide con `#SergodWeb`. Excluye IDs ya incorporados, incluso borradores y retirados. Se utiliza solo el cursor de paginación; nunca se sigue una URL de proveedor que pueda contener tokens. No se consulta un buscador global de hashtags.

Revisar guarda candidatos temporales durante 15 minutos, ligados al administrador y cuenta. **Previsualizar → elegir estado y relaciones opcionales → Importar y publicar/Guardar noticia** confirma el snapshot revisado. El navegador envía el ID de vista previa; no puede suministrar URLs o captions arbitrarios. El servidor vuelve a comprobar vigencia, cuenta, hashtag, duplicados y relaciones al confirmar. El ID de Instagram es único y los bloqueos de transacción impiden duplicados concurrentes.

**Admin → Noticias** permite cambiar estado y relaciones, retirar, volver a publicar y borrar la copia local. Borrar no elimina la publicación original de Instagram. Las publicaciones manuales siguen gestionándose desde **Publicaciones**. El contenido importado es una copia del momento de revisión; no se sincroniza silenciosamente con ediciones posteriores de Instagram.

La relación opcional puede apuntar a una publicación Torneo y/o a un torneo guardado en Liga. Este último conserva su ID TOR y categoría; la noticia ofrece **Ver clasificación** del ranking correspondiente. No se requiere una relación para importar.

## Medios y límites

Las visitas públicas leen datos y medios guardados en SERGOD STORE, sin llamadas a la API Instagram. Las fotos y miniaturas se descargan desde dominios CDN permitidos del proveedor y reutilizan la subida existente: WebP, máximo 1600 px, referencia en BD y almacenamiento de objetos. El video MP4 se copia sin transcodificar a un bucket adicional. Esto evita depender de URLs CDN temporales para la copia aprobada.

Límites de esta implementación: hasta 20 medios por carrusel, 4 MB por imagen y 32 MB por video MP4. Un archivo mayor, inválido o inaccesible impide guardar la noticia completa; no se publica una importación parcial. Un carrusel incompleto se rechaza. Las descargas no admiten redirecciones ni URLs suministradas por el navegador. La importación conserva el orden de los medios y limita descargas concurrentes. Archivos escritos antes de un fallo o de borrar una noticia pueden permanecer en almacenamiento; no se eliminan automáticamente mediante una operación que pueda afectar otras referencias.

En desarrollo local las imágenes usan `/api/media` y los MP4 `/api/news-video`, con soporte de solicitudes Range. En producción ambos se sirven desde Supabase Storage. Crear un bucket público `news-media` que admita `video/mp4`, con límite de al menos 32 MB; las imágenes siguen usando el bucket existente. El navegador puede mostrar una alternativa cuando un MP4 no resulte compatible con sus codecs. No se ha probado todavía un Reel real del canal.

**Stories:** no se importan en esta fase ni se presenta su archivo como equivalente al feed permanente. La lectura de medios propios implementada no usa la ruta de Stories. Su disponibilidad concreta con Instagram Login, los permisos de la aplicación y la recuperación de Stories ya expiradas quedan por confirmar con la cuenta real. La documentación de Meta distingue capacidades de Stories y publicaciones permanentes; la disponibilidad para publicar Stories tampoco demuestra acceso a un archivo histórico. No se promete recuperar el historial de Stories ni detectar un hashtag dibujado sobre su imagen.

## OAuth y configuración al conectar

La documentación directa de varias referencias Meta devolvió acceso restringido/429 durante esta revisión. Se consultó la colección oficial disponible; el contrato OAuth y de medios está cubierto con respuestas controladas, pero **falta certificarlo con una aplicación y cuenta reales**, incluyendo el ID de perfil, versión y campos devueltos. No se afirma que esté conectado ni verificado en Meta.

1. Preparar la cuenta profesional oficial y una aplicación Meta con **Instagram API with Instagram Login**. Usar el ID/secret del producto Instagram. Comprobar roles de prueba, modo de la aplicación, nivel de acceso y cualquier revisión que Meta exija al caso concreto.
2. Registrar exactamente el callback que muestra el panel: `APP_URL/api/admin/integrations/instagram/callback`. Producción: `https://www.sergodstore.cl/api/admin/integrations/instagram/callback`.
3. Configurar en backend `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_API_VERSION` (valor preparado `v25.0`; confirmar versión admitida en la consola) e `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes como 64 caracteres hex; la misma clave segura usada por las integraciones). No usar variables `NEXT_PUBLIC`.
4. Configurar `SUPABASE_NEWS_STORAGE_BUCKET=news-media`, con Storage y claves existentes. Aplicar la migración `010_instagram_news.sql` mediante `npm run db:migrate` en la fase final. Habilita RLS en las cinco tablas nuevas.
5. Conectar desde el panel; comprobar primero una foto, un carrusel y un Reel real: revisar → previsualizar → guardar/publicar → lectura pública → recargar → retirar. Confirmar que se copian los archivos, el hashtag se elimina, no hay duplicados y no se requieren títulos.

El estado OAuth de diez minutos está ligado a administrador y cookie HttpOnly/SameSite, con comparación segura y consumo único antes de intercambiar el código. Los tokens se cifran con AES-256-GCM; no se devuelven al navegador. Se intercambia el token corto por uno largo y se prepara renovación al revisar cuando quedan menos de siete días, tiene más de 24 horas y aún no expiró. Un token vencido pide reconectar. La renovación se guarda antes de consultar medios para conservarla ante un fallo posterior. Se comprueba la identidad de la cuenta en cada revisión.

Desconectar elimina la autorización almacenada, los estados y candidatos locales; conserva las noticias. **No revoca por API el permiso otorgado en Meta**: si se quiere quitar también ese permiso, hacerlo desde las aplicaciones autorizadas de Instagram. Cambiar la clave de cifrado exige reconectar las integraciones.

Referencias oficiales para la comprobación real: [Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/), [access token](https://developers.facebook.com/docs/instagram-platform/reference/access_token/), [refresh](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/), [medios](https://developers.facebook.com/docs/instagram-platform/reference/ig-user/media/), [Stories](https://developers.facebook.com/docs/instagram-platform/reference/ig-user/stories/).

## Pruebas

`tests/instagram.test.ts` utiliza proveedor simulado y base PostgreSQL/PGlite real aislada. Comprueba OAuth/cookie/consumo/cifrado, cuenta propia, hashtag exacto, paginación, vistas previas, expiración, duplicados, descarga y optimización WebP, carrusel mixto, MP4/Range, retiro, fallos externos, conservación del refresh y persistencia al cerrar/reabrir BD. No conecta cuentas reales ni modifica producción.

`tests/e2e/news.spec.ts` comprueba presentación 320/375/768/1440, teclado/swipe, selección y recarga, estados vacío/error, carga del video seleccionado y revisión/importación/edición/retiro/borrado administrativos con API simulada. La regresión `store.spec.ts` conserva el recorrido de noticias manuales con guardado y lectura local real y las rutas públicas/panel adaptables.

Módulos principales: `lib/news.ts`, `lib/server/instagram.ts`, `news-storage.ts`, `integration-crypto.ts`, `components/store/news/` y `components/admin/InstagramAdmin.tsx`. No se añadieron dependencias.

Validación del 7 de octubre: **96/96** pruebas de servidor, TypeScript, compilación de producción y trazado correctos. **Seis recorridos únicos** de navegador comprobados, con revisión visual entre 320 y 1440 px. Dos recorridos se repitieron tras corregir eventos Touch y un selector del código de pruebas. El ajuste final de presentación y errores del panel se recompiló y verificó junto con un recorrido de guardado/recarga real del hashtag, permisos/origen y rechazo de una importación sin revisión. Capturas privadas en `.data/news-review-20261007`. No se probó todavía la API ni OAuth con una cuenta real.
