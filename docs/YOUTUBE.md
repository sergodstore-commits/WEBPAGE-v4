# Transmisiones de YouTube

Desde el 7 de octubre de 2026, Torneos utiliza el canal [@SergodStore](https://www.youtube.com/@SergodStore), ID `UCDm1utULK7cZC2-hutCPlaQ`. El calendario sigue a la izquierda, el directo a la derecha y las grabaciones debajo; en celular se apilan.

## Operación

1. Crear el directo en YouTube Studio; YouTube debe habilitar previamente las emisiones del canal. La verificación telefónica se completó y Studio indicó activación para el 8 de octubre, aproximadamente a las 17:18 de Chile.
2. En Admin → Integraciones → YouTube, pegar el enlace del directo, elegir título y torneo opcional, marcar Programado o En vivo y Visible, y guardar.
3. Al terminar, pulsar «Finalizar y guardar en archivo»: oculta el directo e incorpora la grabación publicada, sin duplicarla. YouTube debe conservar y permitir insertar esa grabación.
4. Para otras grabaciones, pegar su enlace en «Incorporar grabación», revisar título/miniatura, ajustar fecha, subir una miniatura opcional y guardar como borrador o publicar. En Admin → Transmisiones se editan, retiran y borran referencias; el video original de YouTube no se elimina.

El estado Programado/En vivo lo controla el administrador; no hay detección automática del comienzo o final, OAuth ni importación automática del canal. No se necesitan variables nuevas, claves de API, Google Cloud ni servicios de pago. La web consulta únicamente el oEmbed público de YouTube para revisar existencia y pertenencia al canal antes de incorporar o publicar. Solo se aceptan IDs de 11 caracteres o URLs HTTPS de YouTube/youtu.be; nunca se consulta una URL arbitraria introducida por el administrador.

El reproductor utiliza `youtube-nocookie.com`, no reproduce automáticamente, conserva los controles de YouTube y envía el origen mediante `strict-origin-when-cross-origin`. Tiene un alto mínimo de 200 px y un enlace alternativo a YouTube. Las grabaciones cargan un reproductor solo al seleccionarlas. La reproducción efectiva depende de la disponibilidad y permisos del video en YouTube.

## Persistencia y seguridad

Migración versionada `012_youtube.sql`: ajustes del directo y archivo propio con RLS, vínculo opcional a torneos y estados borrador/publicado/retirado. Aplicarla antes de desplegar. La migración conserva las tablas y datos históricos de Twitch; su integración ya no aparece en el panel ni en Torneos. Las rutas antiguas quedan para compatibilidad, sin alimentar la página pública. No se revocan credenciales externas ni se modifica OBS.

Las rutas nuevas requieren administrador y mismo origen para escribir. Los retiros y la ocultación funcionan aunque YouTube no responda. Finalizar el directo y guardar el archivo ocurre en una transacción; el ID único evita grabaciones duplicadas.

## Comprobación

`tests/youtube.test.ts` usa una base aislada real: enlaces seguros, validación de canal, guardado/lectura tras reconexión, publicación/retiro, ocultación ante fallos del proveedor y archivo idempotente. La respuesta oEmbed se simula; no certifica reproducción real.

`tests/e2e/tournaments.spec.ts` comprueba revisión/publicación/recarga/retiro en el panel con API simulada, archivo paginado, miniaturas, reproductor de YouTube en computador/celular, foco, calendario y permisos. La publicación de un torneo usa base local real. `tournament-calendar.spec.ts` conserva la verificación de la agenda.

Referencias: [reproductor](https://developers.google.com/youtube/player_parameters), [requisitos de inserción](https://developers.google.com/youtube/terms/required-minimum-functionality), [habilitar directos](https://support.google.com/youtube/answer/2474026?hl=es).
