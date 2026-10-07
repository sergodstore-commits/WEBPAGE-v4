# Estado de comprobación

## Entrega final — 7 de octubre de 2026

Las seis fases están integradas: Preventas, Torneos/Twitch, Comunidad/rankings, Noticias/Instagram, Administración y Carrito/Cuenta/Checkout. El propietario autorizó publicarlas y conectar Twitch e Instagram después.

- Servidor: **96/96 pruebas aprobadas**, con persistencia local real y proveedores externos simulados donde corresponde.
- Navegador: **40 recorridos únicos aprobados** sobre la compilación final de producción. La ejecución completa aprobó 38; se repitieron y aprobaron los dos restantes después de actualizar el selector del encabezado «Torneos.» y limpiar los intentos acumulados del administrador aislado mediante el setup existente. No se redujo la protección de autenticación.
- TypeScript, construcción y trazado de dependencias correctos. Los recorridos incluyen creación → imagen optimizada → publicación → cliente → recarga → edición → recarga → retiro de artículos y preventas; POS/stock, cuenta, carrito y 23 rutas adaptables. Otros recorridos simulan respuestas de proveedores para revisar estados sin hacer cobros.
- Migraciones **007–010** aplicadas en Supabase, esquema privado `sergod_store`. Lecturas antes/después conservaron 104 artículos, 117 referencias de imágenes, siete pedidos, dos cuentas, 13 movimientos de inventario, configuración y stock total de 31 unidades, sin reservas activas. Coincidieron las huellas completas de artículos, imágenes, cuentas, movimientos y configuración. La conciliación actualiza timestamps de consulta de pedidos; sus estados financieros se comprobaron por lectura.
- Todas las tablas de aplicación mantienen RLS; `anon`/`authenticated` carecen de acceso al esquema privado. El cron mostró cinco ejecuciones SQL recientes correctas; esto por sí solo no demuestra el resultado HTTP.
- El pedido real **#6 permanece aprobado por $2.500**. Esta revisión no generó cobros, pedidos ni correos externos. Las pruebas históricas de Flow y correo se detallan abajo.

La publicación usa GitHub → Vercel, sin reemplazar secretos ni cambiar Flow producción por sandbox. La comprobación pública posterior revisa rutas, APIs, acceso administrativo y modos de pago/integración mediante lectura, conservando los datos comerciales.

Pendientes: existencias y precios definitivos, datos comerciales/publicación de preventas, aplicaciones reales de Twitch/Instagram y pruebas de sus permisos/medios, y contrastar el importador Yu-Gi-Oh! con una exportación real. El contenido público depende de lo que publique el administrador; no se agregan noticias, torneos o rankings ficticios.

## Registro inicial — 26 de septiembre de 2026

La versión revisable está publicada en [www.sergodstore.cl](https://www.sergodstore.cl), con código en [WEBPAGE-v4](https://github.com/sergodstore-commits/WEBPAGE-v4). La nueva tienda reemplazó el contenido de `main` conservando el historial anterior y una etiqueta de respaldo. Supabase, Storage, Resend y Flow sandbox están conectados. Estas pruebas iniciales usaron sandbox. El propietario autorizó posteriormente guardar las claves de producción en Vercel y habilitar pagos reales; la activación se documenta abajo.

## Comprobaciones automatizadas

`npm test` terminó con **45/45 resultados aprobados**, que corresponden a 43 casos y dos contenedores de suite:

- 29 casos con PostgreSQL embebido real: guardado, publicación, lectura, edición, retirada, persistencia después de cerrar y abrir la base, autenticación, reservas, POS y pedidos.
- Nueve casos de contrato HTTP y controles de Flow: firma HMAC, codificación de parámetros, errores del proveedor y de red, y límites de lectura de solicitudes.
- Tres casos de configuración de base: validación de identificadores, CA/verificación TLS conservadas y migraciones privadas junto a tablas antiguas incompatibles, sin fallback a `public`.
- Dos casos de protección de limpieza: solo se acepta el nombre aleatorio exacto creado por la ejecución y su marcador; se rechazan esquemas productivos, patrones e inyección SQL.
- Los casos de inventario incluyen la última unidad disputada por 20 compradores, POS frente a checkout, límites acumulados de preventa, formularios administrativos antiguos, callbacks repetidos, expiración segura y pagos tardíos.

La compilación de producción actual y TypeScript pasaron. El primer paquete Turbopack compiló pero omitió dependencias internas del servidor y devolvió HTTP 500 en Vercel. Se corrigió en `87d7566` usando Webpack. `scripts/verify-build-trace.mjs` ahora bloquea la construcción si faltan runtime/dependencias críticas o aparecen archivos privados. Los manifiestos comprobados incluyen 100 dependencias para páginas y 268 para la API, con las tres migraciones y sin `.data`, `s` ni archivos `.env`.

## Preparación y verificación remotas

- **Supabase PostgreSQL:** conexión TLS validada, tres migraciones aplicadas en `sergod_store` y administrador verificado creado. La aplicación usa autenticación propia; no importa cuentas de Supabase Auth.
- **Proyecto anterior:** las tablas de `public` permanecen intactas. El inventario leído conserva siete productos, cero pedidos y dos cuentas. No se migró su contenido ni se mezcló con el catálogo nuevo.
- **Storage:** bucket público nuevo `product-images`; carga autenticada mediante la API publicada, optimización a WebP y lectura pública HTTP 200 comprobadas. El bucket antiguo sigue privado.
- **Productos/preventas:** por la API administrativa publicada se creó cada tipo, cargó su imagen, publicó, leyó dos veces desde las rutas públicas, editó, volvió a comprobar y retiró. Los dos artículos se identificaron como pruebas técnicas y no están publicados.
- **Local:** dirección, horario y contacto que ya figuraban publicados en el proyecto antiguo se guardaron y releyeron mediante la API nueva. No se trasladaron los siete productos antiguos.
- **Correo de pedidos:** seis mensajes aceptados por Resend/SMTP y registrados `sent`, sin duplicados: pendiente y vencimiento del pedido #1, pendiente y aprobación del #2, pendiente y rechazo del #3. `sent` comprueba aceptación por SMTP, no presencia en la bandeja del destinatario.
- **Cuenta remota:** con el correo expresamente autorizado se comprobó registro, inicio de sesión, verificación con token de un solo uso, rechazo HTTP 403 del acceso administrativo, recuperación de contraseña, revocación de la sesión anterior y acceso con la nueva contraseña. Resend/SMTP aceptó los dos mensajes de verificación y recuperación, con un intento cada uno. Los tokens se obtuvieron de los mensajes de esa cuenta en la cola del servidor y se usaron contra la API publicada; no se accedió a su bandeja externa. La contraseña queda únicamente en el archivo privado local `.data/verified-customer.json`.
- **Flow real en sandbox:** tres órdenes de $1.000 CLP. #1 expiró (estado Flow 4) y liberó reserva; #2 fue aprobada mediante el simulador MACH, descontó stock 3 → 2 y liberó la reserva; #3 fue rechazada (estado Flow 3), conservando stock 2 y reserva 0. El retorno del navegador llegó al detalle protegido del pedido. Cuatro confirmaciones repetidas de #2 devolvieron HTTP 200 sin duplicar movimiento, evento ni correo; el retorno repetido respondió 303. Véase [registro Flow](FLOW-SANDBOX.md).
- **Vercel:** proyecto `sergod-store-v4`, Next.js, Node 24 y 19 variables del servidor guardadas como secretos en producción. El [despliegue funcional `87d7566`](https://vercel.com/sergod-store/sergod-store-v4/8n3cpZD9vnSfnzGw7m6C8np3FDwb) sirve el dominio, `/api/health`, ajustes, catálogo y acceso administrativo.
- **GitHub:** `main` se actualizó sin forzar ni borrar historia. La etiqueta `legacy-before-rebuild-20260925` conserva `bf8cf4d`. La carpeta `s`, claves y datos locales están excluidos del repositorio y del artefacto; se comprobaron los archivos nuevos contra los valores secretos suministrados.
- **Conciliación:** trabajo `sergod_store_reconcile` (id 5) cada minuto en Supabase Cron; credenciales guardadas en Vault. Se comprobaron ejecuciones SQL correctas y una invocación HTTP 200 con `failed=0`. Los trabajos antiguos permanecen separados.

La ejecución de `node --import tsx scripts/verify-postgres.ts` contra PostgreSQL remoto aprobó **9/9 comprobaciones**:

1. Migraciones reales e idempotentes en un esquema temporal propio.
2. Tres conexiones PostgreSQL simultáneas con esquema privado correcto.
3. Veinte checkouts concurrentes sobre una unidad: solo una reserva.
4. Diez callbacks aprobados concurrentes: un descuento de stock, un evento de aprobación y un correo en cola.
5. Seis carreras POS/checkout sin consumir dos veces la última unidad.
6. Seis reservas simultáneas de un cliente respetan su máximo de dos.
7. POS repetido concurrentemente conserva un ticket, descuento y cambio correctos.
8. Un carrito imposible no deja pedidos ni reservas parciales.
9. Cerrar/reabrir el pool conserva pedidos e inventario; ningún correo fue enviado.

Resultado registrado: `simultaneousConnections=3`, `mockFlowRequests=13`, `realFlowRequests=0`, `emailsSent=0`, `cleanupVerified=true`. Flow estuvo completamente simulado. El script cerró sus conexiones y eliminó solo el esquema `sergod_verify_` que había creado, validando nombre y marcador; no usó el esquema de la tienda ni las tablas antiguas. La ejecución se puede repetir con las [instrucciones del script](../scripts/verify-postgres.md).

## Recorridos de navegador

La suite `npm run test:e2e` usa Chrome, una compilación de producción local en el puerto 3100 y una base independiente en `.data/e2e`. No modifica el catálogo principal. `ALLOW_LOCAL_PRODUCTION=true` se limita a este proceso de prueba y permite los adaptadores locales; no debe configurarse en Vercel.

Los ocho recorridos cubren:

1. Artículo de Tienda: crear en el panel, subir y optimizar imagen, guardar borrador, publicar, ver como cliente, recargar, editar, verificar y retirar.
2. Preventa: el mismo recorrido con fechas, cupos, límite por cliente y condiciones de entrega.
3. POS: efectivo, cambio, consulta y recarga del ticket, descuento de stock y ajuste posterior de inventario.
4. Cuenta: registro, enlace de verificación real en el buzón local, sesión persistente, datos de torneo y rechazo de operaciones administrativas para clientes/anónimos.
5. Local: guardar y volver a leer dirección, horario, instrucciones y transportista por pagar.
6. Noticias, comunidad y torneos: crear, subir imagen, publicar, recargar detalle público, editar, retirar y borrar.
7. Dieciocho rutas públicas y administrativas a 1440 y 375 píxeles: comprobar que no existe desbordamiento horizontal y guardar capturas representativas.
8. Carrito: cantidades persistentes, descuentos, envío a agencia por pagar excluido del total y rechazo del pago sin Flow configurado sin crear pedidos ni reservar stock.

**Resultado: 8/8 recorridos aprobados, sin reintentos automáticos, en 2,8 minutos incluyendo la compilación.** Entorno: Windows, Node.js 24.18.1, Next.js 16.3.6 y Playwright 1.63.0 con Chrome. Las capturas y trazas se guardan en `test-results/`, excluido del repositorio por contener datos de prueba. Después del ajuste final de tipografía del panel, la comprobación de las 18 rutas en escritorio/celular se repitió y pasó nuevamente (1/1, 1,1 minutos incluyendo compilación). `npm run typecheck` también pasó con generación automática de tipos para copias nuevas del repositorio.

Después del cambio de empaquetado, [GitHub Actions sobre `87d7566`](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36212003148) aprobó nuevamente tipos, 45 resultados de servidor, construcción con control de artefactos y los ocho recorridos en Chromium/Linux. La repetición local tuvo una interrupción prolongada (50,9 minutos): siete recorridos pasaron y carrito venció por timeout; se repitió solo ese caso y pasó en 54,4 segundos incluyendo construcción. No se ocultó ese fallo mediante reintentos automáticos.

## Activación de producción y pendientes comerciales

El 26/09/2026 se autorizó cambiar Flow a producción y se guardaron sus dos claves y `FLOW_ENV=production` como secretos del entorno Production de Vercel. Antes del cambio se comprobaron cero pedidos pendientes y cero unidades reservadas. La migración 004 conserva e identifica los tres pedidos sandbox, excluyéndolos de las métricas comerciales y evitando consultas con credenciales de otro ambiente. La construcción verifica las credenciales por una consulta GET firmada de solo lectura; no crea pagos ni realiza cargos.

La migración 004 se aplicó en Supabase y se releyeron #1 vencido, #2 aprobado y #3 rechazado, todos con ambiente `sandbox`, sin modificar stock ni reservas. Las métricas comerciales devolvieron cero pedidos, cero pendientes y cero ingresos. Las dos pruebas nuevas cubren migración conservadora y transición entre ambientes (historial, callbacks, cupos, entrega, métricas y POS). La suite inicial obtuvo 46/47 resultados; el único fallo era el contador de migraciones que esperaba tres. Se actualizó a cuatro y se repitió ese archivo con resultado 3/3. TypeScript pasó. La consulta real del nuevo script a Flow sandbox devolvió HTTP 200.

**Activación comprobada:** el [despliegue `f79e12e`](https://vercel.com/sergod-store/sergod-store-v4/66eStttm9iAvTpo9r8qeLJHFEFQq) quedó Ready en producción. Sus logs registran autenticación y consulta de solo lectura a Flow producción con HTTP 200. A las 16:53:50 UTC se verificaron `/api/health`, `payment_mode=production`, acceso administrativo, tres pedidos sandbox sin acciones de pago/entrega comercial y conciliación HTTP 200 con `checked=0`, `failed=0`, `released=0`. No se creó ningún pago real. La [ejecución completa de GitHub Actions](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36256937405) aprobó TypeScript, los 47 resultados de servidor, construcción y ocho recorridos de navegador.

El catálogo real Zero Mulligan está cargado; el propietario debe revisar precios e ingresar las existencias reales, además de configurar los transportistas e instrucciones definitivas. No se ha realizado una compra con dinero real. El pago real de sandbox usó retiro; el flete por pagar se comprobó con pruebas de servidor/navegador, no con un transportista comercial durante el pago remoto.

La recepción efectiva en la bandeja de entrada debe confirmarla el destinatario; el registro, la verificación y la recuperación remotos ya están comprobados con los tokens de los mensajes enviados. Los casos de creación de pago incierta y pago tardío se probaron con respuestas controladas; no se provocaron fallos de red contra el proveedor. El servicio Render del proyecto anterior, sus cron y sus tablas se conservaron; la web nueva usa su servidor Next.js y el esquema privado nuevo.

Sigue [despliegue y variables](DEPLOYMENT.md) y [protocolo de Flow sandbox](FLOW-SANDBOX.md). Las cuentas y claves se configuran en variables de entorno, sin incluirlas en Git ni en los archivos de pruebas.

## Catálogo y variantes — 27/09/2026

La migración 005 se aplicó en Supabase antes de publicar el código. El [despliegue de `8d9ecc1`](https://vercel.com/sergod-store/sergod-store-v4/8PRmy3A84pzPh5qCXmDatMmuwXoe) quedó disponible. La [ejecución completa de GitHub](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36309019944) aprobó TypeScript, **55/55 resultados de servidor**, construcción con control de artefactos y **9/9 recorridos de navegador**. El primer intento del nuevo recorrido falló por un selector del test; se corrigió a selección por rol accesible, se comprobó localmente y luego pasó la suite completa en CI.

La lectura independiente en producción, a las 09:25:08 UTC, confirmó 72 variantes publicadas de 12 familias, stock y reservas cero, metadatos coincidentes con el manifiesto y 77 imágenes WebP propias con HTTP 200. Los dos artículos técnicos existentes conservaron sus datos. La importación recuperó una respuesta interrumpida sin duplicar el artículo; su siguiente ejecución conservó los 72 registros y creó/publicó cero. No hubo pagos ni cambios de inventario comerciales durante esta operación.

El navegador mostró las doce familias y sus imágenes después de recargar; se comprobaron filtros, vista rápida y cambio de formato/color. Cada SKU tiene inventario independiente y el carrito recibe la variante elegida. Se mantienen las limitaciones publicadas por la fuente, especialmente los seis colores de Dados Elemental sin identificación. Consulta el [procedimiento y alcance del catálogo](CATALOG-IMPORT.md).

## Selección Yu-Gi-Oh! y Mitos y Leyendas — 27/09/2026

El [lote adicional de 16 artículos](SELECTED-TCG.md) quedó guardado en producción: 11 publicados en Tienda y cinco preventas en borrador, con 25 imágenes WebP en Storage. La comparación independiente a las 20:04:58 UTC comprobó los datos del manifiesto, stock/reservas cero, imágenes HTTP 200, exclusión pública de los borradores y conservación íntegra de los 74 registros previos. Primer Bloque y Primera Era son familias distintas; cada una tiene su sobre de $2.500. En Mitos, solo los dos especiales Halloween son preventas.

La reanudación conservó tres artículos ya publicados después de resolver una redirección oficial de imágenes. Una repetición posterior creó/publicó cero y preservó los 16. El navegador confirmó formatos, imágenes, precios, SKU y persistencia tras recarga. Los borradores requieren datos comerciales del propietario antes de publicarse; los tres Yu-Gi-Oh! oficiales también requieren precio. No se copiaron existencias de los comercios fuente.

El [despliegue f1c0e0d](https://vercel.com/sergod-store/sergod-store-v4/G3Ut5VVXMd14E4zU1BQBwiQB3S8B) terminó correctamente y [GitHub Actions](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36346595302) aprobó tipos, **64/64 resultados de servidor**, compilación y **9/9 recorridos de navegador**. El lote no necesitó migraciones ni cambios en la interfaz, Flow o sus credenciales.

## Configuración comercial de entregas — 30/09/2026

Por instrucción del propietario se habilitaron dos modalidades de **Starken**: entrega a domicilio y retiro en agencia, ambas con flete **por pagar al recibir**. Los identificadores son `starken-domicilio` y `starken-agencia`; las dos configuraciones usan `collect=true` y `price=0`. El flete se cobra por separado del pago de productos en Flow, sin prometer una tarifa ni un plazo de transporte.

Se confirmó retiro en **Los Carrera 5142, Copiapó**, con la instrucción «Retiro en tienda: Los Carrera 5142, Copiapó.». Se conservaron el horario existente de 10:00 a 22:00, contacto, plazo de reserva y demás ajustes. La escritura pasó por la API administrativa y dos lecturas públicas independientes a las 04:04:27 UTC confirmaron persistencia y Flow en producción. El respaldo previo y el informe permanecen en `.data`, excluido de Git. No se modificaron productos ni se crearon pagos.

La lectura previa a las 04:01:26 UTC confirmó 83 presentaciones publicadas sin existencias, cinco preventas en borrador y cero pedidos comerciales. El propietario indicó que ingresará stock y precios desde el panel. La carga de inventario, los datos pendientes de preventa y el recorrido comercial final siguen separados de esta configuración. No se implementaron las recomendaciones del panel ni la etapa visual.

## Revisión de compra y primer pedido de producción — 30/09/2026

El propietario confirmó que recibió los correos anteriores de prueba y cargó una unidad de Vitrum Fit Inner para comprobar la compra. El pedido #4 reservó esa unidad por $2.990, con retiro en tienda. No se completó el pago: la página de Flow mostró la transacción vencida y una consulta posterior al proveedor confirmó la anulación. A las 13:16:00 UTC, la lectura independiente comprobó pedido `expired`, stock 1, reserva 0, ningún descuento de inventario y ningún evento de aprobación. La compra aprobada con dinero real sigue pendiente.

La reserva tenía vencimiento a las 04:30:50 UTC, pero la consulta al proveedor aún devolvía pendiente antes de abrir su enlace vencido, alrededor de las 13:15 UTC. Por tanto, este recorrido confirma la liberación tras la anulación verificada; **no demuestra que Flow notificara automáticamente el vencimiento dentro de los 15 minutos**. No se forzó la liberación mientras el proveedor seguía informando un pago pendiente.

Se detectó y corrigió que el botón «Continuar con la compra» podía reutilizarse como botón de envío durante el cambio de pantalla y abrir Flow antes de revisar la entrega. Los botones ahora tienen identidades separadas, tipos explícitos y el manejador comprueba el paso actual. La prueba de regresión `tests/e2e/checkout-review.spec.ts` pasó localmente (1/1, incluyendo compilación de producción): tanto continuar como pulsar Enter desde cantidades llevan a revisión sin solicitar checkout; solo el botón final envía una solicitud. También comprueba entrega a agencia por pagar, total $2.990 y stock sin alteraciones. La solicitud final se intercepta en el navegador, sin crear pagos reales ni reservas.

El [despliegue de `ba13208`](https://vercel.com/sergod-store/sergod-store-v4/7SEhEgEKcNX2iVfGai8rLkSgwabY) quedó disponible. [GitHub Actions](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36720537130) aprobó tipos, **64/64 resultados de servidor**, construcción y **10/10 recorridos de navegador**. En producción se comprobó la pantalla de revisión, las modalidades de Starken y que recorrerlas no creara otro pedido ni reservara stock.

## Compra real aprobada — 30/09/2026

Se comprobó una compra real con retiro en tienda. Flow verificó la aprobación y el correo de confirmación quedó enviado con un único intento. El destinatario confirmó haberlo recibido. Los identificadores, importes, productos y horarios de esa operación se conservan exclusivamente en los informes privados.

Las lecturas de la API y PostgreSQL coincidieron: pago `approved` en producción, descuento de inventario correspondiente a la cantidad comprada una sola vez, un único evento de aprobación y reserva liberada. La página del pedido conserva «Pago aprobado» después de recargar; el catálogo público coincide con el inventario administrativo. El retiro permanece como pedido recibido, sin simular preparación ni entrega física.

Se repitió una notificación legítima del mismo pago en `/api/flow/confirmation`, que consulta `payment/getStatus` directamente a Flow. Respondió HTTP 200 y una segunda lectura confirmó que no cambió el stock ni duplicó movimientos, eventos o correos. No se creó otro pago ni se modificó inventario manualmente. Los informes privados de esta comprobación permanecen en `.data`, excluidos de Git.

**Hallazgo independiente del pago aprobado:** un intento abandonado seguía pendiente después del plazo, aunque el proceso automático avanzaba `payment_checked_at`. Este comportamiento motivó la separación entre reserva y pago descrita a continuación. No se liberó inventario manualmente ni se alteró la compra aprobada.

## Reserva independiente del pago

Se reprodujo la conservación del estado pendiente con tres órdenes aisladas de Flow sandbox, sin efectuar pagos ni crear pedidos en la tienda. Dos órdenes con `timeout` de 30 segundos, una de ellas también con `checkout_timeout`, seguían pendientes después del plazo. La tercera abrió la pantalla de selección y la cerró sin elegir medio; con `timeout` de 120 segundos y `checkout_timeout` de 30, seguía pendiente al consultar a los 127 segundos. Estas pruebas no comprobaron entrega de callbacks. Los enlaces y las credenciales se guardaron únicamente en archivos privados. Los parámetros se contrastaron con la [API oficial de Flow](https://developers.flow.cl/api).

La corrección separa la liberación de inventario del resultado financiero mediante `reservation_released_at`. Solo una respuesta de Flow validada contra el pedido permite liberar una reserva pendiente cuyo plazo y margen de 60 segundos terminaron. El pago continúa en conciliación: nunca se declara rechazado o anulado por el reloj. Respuestas repetidas no vuelven a liberar inventario; una aprobación tardía comprueba disponibilidad y cupo antes de confirmar, o deriva el pago a revisión. La cuenta y el panel muestran este caso como pago por verificar con reserva liberada.

Validación previa al despliegue: **72/72 resultados de servidor**, **10/10 recorridos de navegador** en compilación de producción local, TypeScript y formato correctos. La verificación remota aprobó **12/12 comprobaciones PostgreSQL**, incluidas carreras de vencimiento/aprobación, POS/pago tardío y cupo de preventa/pago tardío del mismo cliente, con tres conexiones simultáneas. Usó un esquema temporal propio, 37 solicitudes Flow simuladas, cero solicitudes reales a Flow y cero correos enviados; la limpieza del esquema quedó verificada. La migración 006 se aplicó de forma idempotente en la base de la tienda y una lectura posterior confirmó la conservación de los pedidos existentes.

El [despliegue de `b9508da`](https://vercel.com/sergod-store/sergod-store-v4/BFBZDPJSg1nv56NxNMKTxdbcphUR) quedó disponible y [GitHub Actions](https://github.com/sergodstore-commits/WEBPAGE-v4/actions/runs/36794927639) volvió a aprobar tipos, construcción, **72/72 resultados de servidor** y **10/10 recorridos de navegador**. Una lectura de solo lectura en producción confirmó que el cron liberó la reserva abandonada y envió un único aviso; el pago aprobado, su historial y su movimiento de inventario se conservaron. No se abrió el enlace de Flow ni se forzó la consulta del pedido antes de observar la liberación. Después se comprobó la cuenta: explica la reserva liberada, mantiene la opción de consultar el pago y ya no ofrece continuar pagando ese intento.

## Base visual y Home — 3 de octubre de 2026

Primera etapa visual: logo oficial y favicon, Inter/Barlow locales, cabecera/pie adaptables y Home con cartas reales, Anime.js, control de movimiento y contenido publicado. Sin cambios de datos comerciales, pagos ni esquema.

- TypeScript: correcto.
- `npm test`: 72/72 casos aprobados, PostgreSQL local real y Flow simulado; ningún cobro ni correo externo nuevo.
- `npm run test:e2e`: 14/14 recorridos aprobados en compilación de producción aislada, incluido el trazado del servidor.
- Cuatro recorridos nuevos: Hero y CTA en 320/375/768/1440; menú con teclado/Escape; pausa persistente y movimiento reducido en vivo; lectura de contenido, torneos futuros y filtros por juego conservados al recargar.
- La regresión cubrió cuenta, carrito/revisión de compra, variantes, publicación/relectura/edición/retirada, POS y 18 rutas públicas/administrativas a 1440/375.
- Revisión visual del Hero en escritorio 1440 y móvil375: capas, tipografía, botones y proporciones de cartas correctas. Las capturas y reportes locales permanecen en `test-results`/`playwright-report`, excluidos de Git.

El alcance y mantenimiento quedan en [DISENO-VISUAL.md](DISENO-VISUAL.md). La siguiente fase visual espera la revisión del propietario.
