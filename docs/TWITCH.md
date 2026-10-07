# Torneos y Twitch

La página Torneos informa próximas fechas y ofrece transmisiones. No administra inscripciones, participantes, pagos, premios ni cupos. Los próximos torneos se crean en **Admin → Torneos**; solo título y fecha/hora son obligatorios para publicar. Texto, lugar e imagen son opcionales. Los eventos anteriores no se presentan como próximos.

## Archivo y directo

**Admin → Integraciones → Twitch** conecta el canal mediante OAuth oficial. **Revisar Twitch** consulta 20 VOD por página y permite pedir más. No importa ni publica automáticamente. Cada candidato se previsualiza, puede relacionarse con un torneo, utilizar la miniatura Twitch o una imagen personalizada y guardarse como borrador, publicado o retirado. El servidor vuelve a comprobar que el VOD pertenece al canal conectado antes de incorporarlo. El ID externo único evita importarlo dos veces.

**Admin → Transmisiones** permite editar, retirar, volver a publicar y borrar registros locales. No borra videos en Twitch. La miniatura personalizada se guarda con el sistema existente: optimización WebP, almacenamiento de objetos y referencia en BD. La prioridad pública es personalizada → Twitch → logo SERGOD STORE; también se aplica cuando una imagen no carga.

El directo es de activación manual. Guardar como visible comprueba con Twitch que el canal esté transmitiendo; el título vacío utiliza el contexto de la transmisión actual. Al terminar, cambiar a Oculta. No se consulta Twitch en cada visita pública ni existe detección automática continua. Desconectar oculta el directo y conserva el archivo publicado.

La web pública lee metadatos ya guardados. Inicialmente muestra seis VOD y carga más al pedirlos. Un VOD seleccionado abre un reproductor y cerrarlo lo desmonta, devuelve el foco y restaura el desplazamiento. El video permanece en Twitch. Se utiliza iframe oficial con dominio `parent`, video con prefijo `v`, sin autoplay y sonido silenciado inicialmente. El iframe conserva 16:9 y el mínimo oficial de 400×300; cuando el espacio no permite ambas condiciones, se ofrece abrir Twitch. Si Twitch retira un VOD, la publicación local sigue disponible y el enlace externo permite comprobar su disponibilidad.

## Configuración pendiente para conexión real

El propietario indicó que registrará la aplicación al final. Hasta entonces Conectar y Revisar permanecen deshabilitados, con una explicación en el panel. La implementación y pruebas locales están disponibles; no se ha conectado una cuenta real ni comprobado reproducción real de un VOD del canal.

1. Registrar una aplicación **confidencial** en <https://dev.twitch.tv/console/apps> (cuenta Twitch con 2FA).
2. Registrar exactamente el callback que muestra el panel: `APP_URL/api/admin/integrations/twitch/callback`. Para producción: `https://www.sergodstore.cl/api/admin/integrations/twitch/callback`. Para revisión local, utilizar la URL local efectiva y también registrarla en Twitch.
3. Configurar solo en backend `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` e `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes aleatorios, representados con 64 caracteres hex). No usar variables NEXT_PUBLIC ni subir valores al repositorio.
4. Aplicar migraciones con `npm run db:migrate` usando el esquema configurado antes de publicar. `008_twitch.sql` crea conexión, estados OAuth, directo y archivo con RLS habilitado. En el desarrollo local se aplican automáticamente. La migración anterior `007` conserva compatibilidad con el campo de importancia preparado previamente; la cartelera actual no lo utiliza.
5. Reiniciar o desplegar, iniciar sesión como administrador, conectar el canal oficial y comprobar Revisar → seleccionar → miniatura → guardar/publicar → recargar → editar/retirar. Probar un VOD real y el directo en HTTPS público.

Los tokens se cifran con AES-256-GCM en la BD; conservar la clave de cifrado fuera del repositorio y en el gestor seguro de variables. Cambiarla requiere desconectar/reconectar las integraciones existentes. Nunca se devuelven tokens al navegador. OAuth utiliza un estado aleatorio de diez minutos ligado al administrador y cookie HttpOnly/SameSite, consumido una sola vez. Revisar valida la autorización; el refresh se serializa y se guarda antes de consultas posteriores para conservar los tokens rotados incluso si la consulta falla. Desconectar revoca el access token si Twitch responde y siempre elimina la conexión local. Operaciones de escritura requieren sesión admin y origen propio; el callback utiliza estado OAuth.

## Pruebas

`npm test`: PostgreSQL local aislado, OAuth con proveedor simulado, nonce/cookie/admin/replay, cifrado, validación de canal, duplicados, miniaturas, directo, retiro, refresh tras error, lectura después de reabrir la BD y desconexión. No utiliza claves reales, compra ni envía correos.

`npx playwright test tests/e2e/tournaments.spec.ts`: cartelera y VOD con datos de prueba, paginación, prioridad de miniaturas, montaje/cierre del reproductor, foco, anchos 320/375/768/1440 y permisos. El recorrido de transmisiones comprueba revisión sin importación automática, selección, miniatura personalizada, publicación, recarga y retiro con API simulada. Las pruebas del reproductor no certifican disponibilidad o reproducción real de Twitch. El otro recorrido de Admin crea y publica un torneo sencillo con persistencia local real.

Referencias oficiales: [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [validación](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [Get Videos](https://dev.twitch.tv/docs/api/videos/), [embed](https://dev.twitch.tv/docs/embed/video-and-clips/).
