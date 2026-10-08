# Noticias e Instagram

## Funcionamiento vigente — 8 octubre 2026

Por decisión del propietario, las publicaciones de Instagram se muestran integradas desde Instagram. Al incorporar una noticia se guardan el enlace, texto, fecha, tipo, cuenta y relaciones opcionales con torneos; **no se descargan ni suben fotos o videos a Supabase**. La columna de medios queda vacía para las nuevas incorporaciones. Los archivos históricos no se borran.

El visor monta una sola publicación del proveedor. Las tarjetas del archivo muestran texto, fecha e indicador de Instagram, evitando cargar múltiples reproductores. Seleccionar conserva el enlace `?publicacion=ID` al recargar. Hay acceso a la publicación original incluso si la inserción falla. Solo se permiten enlaces HTTPS de instagram.com de tipo `/p/` o `/reel/`, sin credenciales ni puertos; la URL de inserción se genera localmente sin parámetros de seguimiento. Las noticias manuales mantienen sus imágenes y videos propios.

La reproducción depende de Instagram: una publicación eliminada, privada, con inserciones deshabilitadas o restringida puede dejar de mostrarse. El reproductor conserva el estilo de Instagram. La tienda no garantiza una copia permanente ni sincroniza automáticamente el texto guardado con ediciones del original. Referencia: [inserciones de Instagram](https://developers.facebook.com/documentation/instagram-platform/oembed).

## Panel y seguridad

Admin → Noticias permite [actualizar y seleccionar todas las publicaciones](INSTAGRAM-SELECTION.md) de la cuenta conectada, sin hashtag. La consulta es paginada e incluye publicaciones ya incorporadas; excluye Stories. Las casillas se aplican al guardar, con lectura pública comprobada. Desmarcar retira de la web y conserva el registro y el original. Las vistas previas de publicaciones nuevas duran 15 minutos y pertenecen al administrador. El servidor valida vigencia, cuenta, duplicados y relaciones; no hay publicación automática. Admin → Integraciones mantiene la conexión de solo lectura.

Producción utiliza Facebook Login: `INSTAGRAM_LOGIN_MODE=facebook`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_FACEBOOK_PAGE_ID`, `INSTAGRAM_API_VERSION=v26.0` e `INTEGRATIONS_ENCRYPTION_KEY` privada existente. No usar variables NEXT_PUBLIC. Callback exacto: `https://www.sergodstore.cl/api/admin/integrations/instagram/callback`.

Solicita únicamente `instagram_basic,pages_show_list,pages_read_engagement`. La cuenta profesional debe estar vinculada a la página configurada. El servidor consulta directamente el identificador de la página configurada y exige que Meta permita leer ese recurso, devuelva ese mismo ID y su cuenta `instagram_business_account`. No selecciona otras páginas. La lista /me/accounts puede estar vacía para páginas empresariales aunque la consulta directa esté autorizada. Cada revisión verifica identidad y vínculo. Credenciales cifradas AES-256-GCM, estado de un uso ligado a administrador/cookie/configuración, secretos en intercambio de servidor y Bearer en consultas. Los tokens Facebook vencidos requieren reconectar; no se renuevan mediante endpoints de Instagram Login. Desconectar conserva noticias y elimina credenciales locales; la revocación en Meta se realiza desde su configuración.

La modalidad original Instagram Login sigue disponible con `INSTAGRAM_LOGIN_MODE=instagram` y permiso `instagram_business_basic`. No se requiere nueva migración; la migración 010 ya contiene los registros necesarios. El depósito `news-media` fue creado con autorización (público, MP4, máximo 32 MB), pero el nuevo flujo integrado no lo utiliza.

## Comprobaciones

Pruebas con proveedor simulado y base real aislada: OAuth, cifrado, identidad/página fija, hashtag, estados/vistas previas, deduplicación, guardado sin llamadas de descarga, lectura después de reabrir la base, edición y retiro. Pruebas de navegador: noticias manuales, panel, inserción única, selección/recarga y anchos 320/375/768/1440. La conexión real quedó autorizada y guardada en producción para @sergodstore. Se consultaron 25 publicaciones y se comprobó el recorrido de una noticia real: previsualizar → publicar → verla como cliente → recargar → editar a Retirado → comprobar que desaparece de la vista pública. El Reel original permaneció intacto. La prueba usó temporalmente #yugioh y se restauró #SergodWeb. No se comprobó reproducción completa del video; sí la carga real de su inserción, portada y enlace.

Diagnóstico real del 7 de octubre: Meta concedió instagram_basic y pages_show_list, pero /me/accounts devolvió vacío y la consulta de la página rechazó el acceso con código 100, exigiendo pages_read_engagement. El propietario aprobó y concedió este tercer permiso de lectura. No se solicitan publicación, mensajes ni anuncios.

Tras conceder pages_read_engagement, la consulta directa confirmó página 1364457783417715 vinculada a Instagram 17841445441592728. Se eliminó la dependencia de /me/accounts para validar la página: se valida el recurso fijo y la identidad enlazada en cada consulta, sin elegir páginas alternativas.

Durante la comprobación apareció EMAXCONNSESSION en Supabase: conexiones en modo sesión agotaron el límite de 15. En Vercel, las URLs del pooler Supabase en puerto 5432 se conectan ahora al puerto 6543 (transacciones), con máximo dos conexiones por instancia e inactividad de cinco segundos. Otras conexiones y entornos locales conservan su configuración. Se verificó una transacción real con TLS, cuatro pruebas de configuración/aislamiento y tipos; el panel recuperó lectura y escritura. No se modificó el plan contratado. Despliegue y CI de aefe35f: correctos.
