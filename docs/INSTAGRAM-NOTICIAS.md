# Noticias e Instagram

## Funcionamiento vigente — 7 octubre 2026

Por decisión del propietario, las publicaciones de Instagram se muestran integradas desde Instagram. Al incorporar una noticia se guardan el enlace, texto, fecha, tipo, cuenta y relaciones opcionales con torneos; **no se descargan ni suben fotos o videos a Supabase**. La columna de medios queda vacía para las nuevas incorporaciones. Los archivos históricos no se borran.

El visor monta una sola publicación del proveedor. Las tarjetas del archivo muestran texto, fecha e indicador de Instagram, evitando cargar múltiples reproductores. Seleccionar conserva el enlace `?publicacion=ID` al recargar. Hay acceso a la publicación original incluso si la inserción falla. Solo se permiten enlaces HTTPS de instagram.com de tipo `/p/` o `/reel/`, sin credenciales ni puertos; la URL de inserción se genera localmente sin parámetros de seguimiento. Las noticias manuales mantienen sus imágenes y videos propios.

La reproducción depende de Instagram: una publicación eliminada, privada, con inserciones deshabilitadas o restringida puede dejar de mostrarse. El reproductor conserva el estilo de Instagram. La tienda no garantiza una copia permanente ni sincroniza automáticamente el texto guardado con ediciones del original. Referencia: [inserciones de Instagram](https://developers.facebook.com/documentation/instagram-platform/oembed).

## Panel y seguridad

Admin → Integraciones → Instagram permite configurar el hashtag, conectar, revisar y previsualizar. La revisión consulta únicamente medios de la cuenta conectada, filtra el hashtag exacto y excluye Stories e IDs ya incorporados. Los candidatos duran 15 minutos y pertenecen al administrador. El navegador envía solo el ID de vista previa y estado/relaciones; el servidor comprueba vigencia, cuenta, hashtag, duplicados y torneos. La publicación no es automática. Admin → Noticias permite editar estado/relaciones, retirar y eliminar el registro local sin modificar Instagram.

Producción utiliza Facebook Login: `INSTAGRAM_LOGIN_MODE=facebook`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_FACEBOOK_PAGE_ID`, `INSTAGRAM_API_VERSION=v26.0` e `INTEGRATIONS_ENCRYPTION_KEY` privada existente. No usar variables NEXT_PUBLIC. Callback exacto: `https://www.sergodstore.cl/api/admin/integrations/instagram/callback`.

Solicita únicamente `instagram_basic,pages_show_list,pages_read_engagement`. La cuenta profesional debe estar vinculada a la página configurada. El servidor consulta la lista de páginas con cursores (máximo 20 páginas), exige la página concreta y comprueba su cuenta `instagram_business_account`. No elige la primera página. Cada revisión verifica identidad y vínculo. Credenciales cifradas AES-256-GCM, estado de un uso ligado a administrador/cookie/configuración, secretos en intercambio de servidor y Bearer en consultas. Los tokens Facebook vencidos requieren reconectar; no se renuevan mediante endpoints de Instagram Login. Desconectar conserva noticias y elimina credenciales locales; la revocación en Meta se realiza desde su configuración.

La modalidad original Instagram Login sigue disponible con `INSTAGRAM_LOGIN_MODE=instagram` y permiso `instagram_business_basic`. No se requiere nueva migración; la migración 010 ya contiene los registros necesarios. El depósito `news-media` fue creado con autorización (público, MP4, máximo 32 MB), pero el nuevo flujo integrado no lo utiliza.

## Comprobaciones

Pruebas con proveedor simulado y base real aislada: OAuth, cifrado, identidad/página fija, hashtag, estados/vistas previas, deduplicación, guardado sin llamadas de descarga, lectura después de reabrir la base, edición y retiro. Pruebas de navegador: noticias manuales, panel, inserción única, selección/recarga y anchos 320/375/768/1440. La API y la visualización de publicaciones reales siguen pendientes de vincular Facebook/Instagram y autorizar la cuenta; las pruebas simuladas no sustituyen esa comprobación.

Diagnóstico real del 7 de octubre: Meta concedió instagram_basic y pages_show_list, pero /me/accounts devolvió vacío y la consulta de la página rechazó el acceso con código 100, exigiendo pages_read_engagement. Se preparó este tercer permiso de lectura; su concesión adicional requiere aprobación del propietario. No se solicitan publicación, mensajes ni anuncios.
