# Torneos y Twitch

**Referencia histórica:** desde el 7 de octubre de 2026, la web y el panel usan [YouTube](YOUTUBE.md). Los datos y rutas de Twitch se conservan para compatibilidad, pero no alimentan Torneos. El resto de este documento describe la integración anterior.

La página Torneos informa próximas fechas y ofrece transmisiones. No administra inscripciones, participantes, pagos, premios ni cupos. Los próximos torneos se crean en **Admin → Torneos**; solo título y fecha/hora son obligatorios para publicar. Texto, lugar e imagen son opcionales. Los eventos anteriores no se presentan como próximos.

En Próximos torneos, el calendario mensual ocupa la columna izquierda y el directo de Twitch la derecha; en celular se apilan. El calendario empieza en el mes actual de Chile, muestra de lunes a domingo y agrupa las publicaciones por su fecha en America/Santiago. Permite cambiar de mes, volver a Hoy y ampliar/compactar las celdas. Pulsar un día muestra todos sus eventos ordenados por hora, con ubicación y enlace al detalle. Incluye los eventos publicados anteriores al consultar su mes; el listado de próximas fechas debajo solo contiene los futuros. Los videos anteriores permanecen debajo de la agenda y el directo. No necesita campos nuevos ni migraciones: editar la fecha, publicar o retirar desde Admin actualiza el calendario al recargar.

## Archivo y directo

**Admin → Integraciones → Twitch** conecta el canal mediante OAuth oficial. **Revisar Twitch** consulta 20 VOD por página y permite pedir más. No importa ni publica automáticamente. Cada candidato se previsualiza, puede relacionarse con un torneo, utilizar la miniatura Twitch o una imagen personalizada y guardarse como borrador, publicado o retirado. El servidor vuelve a comprobar que el VOD pertenece al canal conectado antes de incorporarlo. El ID externo único evita importarlo dos veces.

**Admin → Transmisiones** permite editar, retirar, volver a publicar y borrar registros locales. No borra videos en Twitch. La miniatura personalizada se guarda con el sistema existente: optimización WebP, almacenamiento de objetos y referencia en BD. La prioridad pública es personalizada → Twitch → logo SERGOD STORE; también se aplica cuando una imagen no carga.

El directo es de activación manual. Guardar como visible comprueba con Twitch que el canal esté transmitiendo; el título vacío utiliza el contexto de la transmisión actual. Al terminar, cambiar a Oculta. No se consulta Twitch en cada visita pública ni existe detección automática continua. Desconectar oculta el directo y conserva el archivo publicado.

La web pública lee metadatos ya guardados. Inicialmente muestra seis VOD y carga más al pedirlos. Un VOD seleccionado abre un reproductor y cerrarlo lo desmonta, devuelve el foco y restaura el desplazamiento. El video permanece en Twitch. Se utiliza iframe oficial con dominio `parent`, video con prefijo `v`, sin autoplay y sonido silenciado inicialmente. El iframe conserva 16:9 y el mínimo oficial de 400×300; cuando el espacio no permite ambas condiciones, se ofrece abrir Twitch. Si Twitch retira un VOD, la publicación local sigue disponible y el enlace externo permite comprobar su disponibilidad.

## Conexión y configuración

El 7 de octubre de 2026 se conectó en producción la cuenta sergodstore mediante OAuth, se comprobó la consulta real y se verificó que la conexión se mantiene al recargar. La consulta no encontró VOD en el canal. OBS también quedó conectado por el propietario; no se ha probado una emisión ni reproducción real de un VOD. Estos son los pasos de configuración para instalar o recuperar la conexión:

1. Registrar una aplicación **confidencial** en <https://dev.twitch.tv/console/apps> (cuenta Twitch con 2FA).
2. Registrar exactamente el callback que muestra el panel: `APP_URL/api/admin/integrations/twitch/callback`. Para producción: `https://www.sergodstore.cl/api/admin/integrations/twitch/callback`. Para revisión local, utilizar la URL local efectiva y también registrarla en Twitch.
3. Configurar solo en backend `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` e `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes aleatorios, representados con 64 caracteres hex). No usar variables NEXT_PUBLIC ni subir valores al repositorio.
4. Aplicar migraciones con `npm run db:migrate` usando el esquema configurado antes de publicar. `008_twitch.sql` crea conexión, estados OAuth, directo y archivo con RLS habilitado. En el desarrollo local se aplican automáticamente. La migración anterior `007` conserva compatibilidad con el campo de importancia preparado previamente; la cartelera actual no lo utiliza.
5. Reiniciar o desplegar, iniciar sesión como administrador, conectar el canal oficial y comprobar Revisar → seleccionar → miniatura → guardar/publicar → recargar → editar/retirar. Probar un VOD real y el directo en HTTPS público.

Los tokens se cifran con AES-256-GCM en la BD; conservar la clave de cifrado fuera del repositorio y en el gestor seguro de variables. Cambiarla requiere desconectar/reconectar las integraciones existentes. Nunca se devuelven tokens al navegador. OAuth utiliza un estado aleatorio de diez minutos ligado al administrador y cookie HttpOnly/SameSite, consumido una sola vez. Revisar valida la autorización; el refresh se serializa y se guarda antes de consultas posteriores para conservar los tokens rotados incluso si la consulta falla. Desconectar revoca el access token si Twitch responde y siempre elimina la conexión local. Operaciones de escritura requieren sesión admin y origen propio; el callback utiliza estado OAuth.

## Pruebas

`npm test`: PostgreSQL local aislado, OAuth con proveedor simulado, nonce/cookie/admin/replay, cifrado, validación de canal, duplicados, miniaturas, directo, retiro, refresh tras error, lectura después de reabrir la BD y desconexión. No utiliza claves reales, compra ni envía correos.

`npx playwright test tests/e2e/tournaments.spec.ts`: cartelera y VOD con datos de prueba, paginación, prioridad de miniaturas, montaje/cierre del reproductor, foco, anchos 320/375/768/1440 y permisos. El recorrido de transmisiones comprueba revisión sin importación automática, selección, miniatura personalizada, publicación, recarga y retiro con API simulada. Las pruebas del reproductor no certifican disponibilidad o reproducción real de Twitch. El otro recorrido de Admin crea y publica un torneo sencillo con persistencia local real.

`tests/e2e/tournament-calendar.spec.ts`: calendario en año bisiesto, cambio de año, agrupación de un evento UTC del mes siguiente en el día correcto de Chile, varios eventos ordenados por hora, navegación, detalle, expansión y columnas escritorio/celular. El recorrido de Admin existente comprueba que un torneo guardado sigue visible en el calendario después de recargar.

Referencias oficiales: [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [validación](https://dev.twitch.tv/docs/authentication/validate-tokens/), [refresh](https://dev.twitch.tv/docs/authentication/refresh-tokens/), [Get Videos](https://dev.twitch.tv/docs/api/videos/), [embed](https://dev.twitch.tv/docs/embed/video-and-clips/).
