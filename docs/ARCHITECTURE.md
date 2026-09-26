# Arquitectura vigente

La aplicación es una sola instalación Next.js 16 con interfaz pública, panel administrativo y API del servidor. El navegador consulta a Next.js; la base, el almacenamiento, Flow y SMTP se conectan desde el servidor. Los cambios administrativos se guardan en PostgreSQL y se leen nuevamente desde la API.

## Módulos

| Ubicación                                         | Responsabilidad                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`, `app/[[...slug]]/page.tsx`      | Documento y entrada de las rutas de la aplicación.                                                                  |
| `components/SiteApp.tsx`                          | Selecciona interfaz pública o administrativa según la ruta.                                                         |
| `components/StoreApp.tsx`, `components/store.css` | Inicio, catálogo, preventas, publicaciones, cuenta, carrito, entrega y pedidos del cliente.                         |
| `components/AdminApp.tsx`, `components/admin.css` | Artículos, imágenes, publicación, inventario, pedidos, entregas, clientes, contenido, configuración y POS.          |
| `app/api/[...path]/route.ts`                      | Rutas HTTP, autenticación y autorización, protección de origen, límites y traducción de errores.                    |
| `lib/server/db.ts`                                | Adaptador PostgreSQL/PGlite, conexiones, transacciones y migraciones.                                               |
| `lib/server/database-config.ts`                   | Validación del esquema SQL y configuración TLS que conserva la CA explícita.                                      |
| `lib/server/core.ts`                              | Errores, validadores comunes, tokens, límites, origen, eventos y respuestas públicas.                               |
| `lib/server/auth.ts`                              | Registro, contraseñas, sesiones, verificación, recuperación y edición de cuenta.                                    |
| `lib/server/catalog.ts`                           | Productos, preventas, publicación, inventario y configuración del local/transportistas.                             |
| `lib/server/content.ts`                           | Noticias, comunidad y torneos.                                                                                      |
| `lib/server/storage.ts`                           | Validación y optimización de imágenes, persistencia de objetos y referencias.                                       |
| `lib/server/commerce.ts`                          | Reservas, importes, pedidos, POS, cambios de pago, inventario y entregas.                                           |
| `lib/server/flow.ts`                              | Firma HMAC, creación/consulta de pago y conciliación con Flow.                                                      |
| `lib/server/mail.ts`                              | Bandeja transaccional de correo, deduplicación y envío SMTP.                                                        |
| `lib/types.ts`, `lib/client.ts`                   | Contratos de datos, acceso HTTP, pesos chilenos, fechas y etiquetas de estado.                                      |
| `db/migrations`                                   | Cambios SQL versionados aplicados mediante `schema_migrations`.                                                     |
| `scripts`                                         | Aplicación de migraciones, creación inicial del administrador y comprobación básica de configuración de producción. |
| `tests/store.test.ts`                             | Pruebas de integración sobre una base aislada.                                                                      |
| `tests/flow.test.ts`                              | Firma HMAC, contrato HTTP y errores de Flow con respuestas simuladas; no llama al proveedor real.                   |
| `tests/database-config.test.ts`                   | Convivencia con tablas antiguas, aislamiento de esquemas, migraciones y TLS.                                        |
| `scripts/verify-postgres.ts`                      | Concurrencia y persistencia sobre PostgreSQL real en un esquema temporal propio.                                    |
| `scripts/verify-postgres-guards.ts`, `tests/verify-postgres-guards.test.ts` | Validación del nombre y marcador que permiten eliminar exclusivamente el esquema de la verificación. |
| `tests/e2e`                                       | Recorridos de navegador mediante Playwright.                                                                        |

## Datos y entornos

En desarrollo, PGlite ejecuta PostgreSQL embebido y persiste en `.data/postgres`. Las imágenes optimizadas se guardan en `.data/objects`; una ruta del servidor las entrega por URL. Esto permite trabajar sin servicios externos y conservar cambios después de reiniciar.

En producción, `DATABASE_URL` selecciona PostgreSQL remoto en Supabase. `DATABASE_SCHEMA` selecciona el esquema SQL y tiene `public` como valor por defecto. La instalación remota actual usa explícitamente **`sergod_store`**, con sus migraciones y administrador ya creados; las tablas antiguas de `public` permanecen separadas. El mismo selector funciona con PGlite.

El adaptador ejecuta cada consulta suelta dentro de una transacción y establece `search_path` localmente en ella. Las transacciones de varias consultas lo establecen una vez. Esto permite usar un pooler de transacciones sin depender de estado de sesión; no se añade `public` como alternativa si falta una tabla. Las migraciones crean un esquema explícito inexistente con propietario actual y revocan acceso `PUBLIC`; no vacían un esquema existente. El historial de migraciones también pertenece al esquema elegido.

`database-config.ts` valida el identificador del esquema y retira los parámetros SSL de la URL antes de pasarla a `pg`. La configuración del servidor conserva `rejectUnauthorized: true` y el certificado de `DATABASE_SSL_CA`, incluso si la URL contiene `sslmode`.

Las imágenes se escriben en Supabase Storage usando una clave de servicio privada. Ya se creó el bucket público `product-images` y se comprobó la clave `service_role` JWT heredada; la carga desde la versión publicada queda por validar. La lectura de fotografías es pública, y la carga pasa por la autorización del administrador. No se almacenan imágenes como base64 en los registros de productos.

Las tablas principales son:

- `users`, `sessions`, `auth_tokens`, `rate_limits`: cuentas, sesiones, verificación/recuperación y límites de solicitudes.
- `products`, `uploads`, `inventory_movements`: artículos, imágenes y trazabilidad de existencias.
- `orders`, `order_events`: pedidos online o ventas POS, artículos vendidos, pagos y entregas.
- `posts`: publicaciones de noticias, comunidad y torneos.
- `settings`: información del local, plazo de reserva y transportistas.
- `mail_outbox`: mensajes pendientes, enviados o fallidos.

Las tablas de negocio tienen RLS habilitado sin políticas públicas para clientes directos de Supabase. La aplicación usa una conexión PostgreSQL privada con permisos del propietario y realiza la autorización en las rutas del servidor. El navegador no dispone de conexión a la base ni de claves de servicio. La tabla técnica `schema_migrations` registra los archivos ya aplicados.

No hay sincronización entre el entorno local y el remoto. Los SQL actualizan la estructura, no trasladan productos, clientes, pedidos ni imágenes. No se ha implementado una migración de contenido local ni del proyecto anterior. El inventario leído del esquema antiguo conserva siete productos, cero pedidos y dos cuentas; esos registros no se copiaron a `sergod_store`.

## Cuentas y permisos

La autenticación es propia; no utiliza Supabase Auth. Las contraseñas se derivan mediante scrypt con sal individual. Las sesiones usan tokens aleatorios, su hash se guarda en PostgreSQL y la cookie `sergod_session` es `HttpOnly`, `SameSite=Lax` y `Secure` cuando la URL configurada usa HTTPS. La duración de sesión es 30 días.

Verificación y recuperación utilizan tokens de un solo uso con vencimiento y hash en la base. Restablecer la contraseña invalida las sesiones existentes. El rol `customer` puede consultar sus propios pedidos y editar su cuenta; `admin` controla operaciones administrativas. El servidor exige correo verificado antes del checkout.

Las escrituras de la interfaz comprueban `Origin` contra `APP_URL`. Los endpoints de notificación y retorno Flow aceptan el contrato del proveedor, y el mantenimiento requiere un secreto Bearer independiente. Estas excepciones no permiten que el navegador marque un pago como aprobado.

El servidor valida entradas, limita tamaños de petición e imágenes y aplica límites de solicitudes persistentes en operaciones sensibles. Los secretos pertenecen al entorno del servidor; ninguna clave privada debe enviarse a los componentes del cliente.

## Artículos, publicación y stock

Tienda y Preventas comparten la tabla `products`; `kind` determina su sección. Una preventa agrega apertura, cierre, máximo por cliente y condiciones de entrega. Los estados de publicación son `draft`, `published` y `withdrawn`. Solo se muestran artículos publicados y no eliminados.

Guardar no publica automáticamente un artículo nuevo. La publicación requiere nombre, descripción, SKU, precio positivo, categoría e imagen almacenada. Las preventas exigen además fechas válidas, cierre futuro, máximo y condiciones. El servidor valida las referencias contra `uploads`; no basta con escribir una URL arbitraria en el formulario.

`images[0]` es la portada. Cambiar el orden cambia la portada. Sharp comprueba el formato, aplica orientación, reduce el tamaño máximo y genera WebP; el objeto se guarda antes de registrar su referencia.

Cada producto mantiene:

- `stock`: existencias físicas o cupos totales aún no consumidos.
- `reserved`: unidades apartadas por pedidos pendientes.
- `available = stock - reserved`: unidades que puede consumir una nueva compra o venta POS.
- `version`: revisión incrementada por un trigger cuando cambia el producto.

Al guardar una edición se envía la versión que abrió el administrador. Si hubo una venta, reserva u otro cambio, el servidor rechaza el formulario desactualizado y pide recargar. Esto evita que guardar el formulario reponga un stock antiguo.

Reservas, aprobación de pagos y POS utilizan transacciones y bloqueos sobre los registros afectados. Las restricciones SQL impiden existencias negativas o reservas mayores que el stock. El límite de una preventa considera los pedidos pendientes, aprobados y en revisión que ya tiene ese cliente.

Retirar oculta un artículo. Borrar un artículo marca `deleted_at` y lo retira, conservando los registros requeridos por inventario y ventas. Cada pedido guarda una copia de nombre, SKU, imagen, precio y cantidad; editar el catálogo no reescribe la venta histórica. No existe purga automática de imágenes.

## Carrito, pedido y Flow

El carrito del navegador conserva solamente IDs de producto y cantidades. El catálogo aporta precios actuales para la interfaz, pero el servidor vuelve a calcular precios, descuentos y entrega al reservar. No confía en un total calculado por el navegador.

El checkout requiere una cuenta verificada, datos de entrega válidos y una clave de idempotencia. La base asocia esa clave al usuario y a una huella de artículos/entrega: repetir el mismo intento devuelve el pedido existente, y reutilizarlo con otro contenido produce un error. Las ventas POS emplean una protección equivalente.

El flujo online es:

1. Validar disponibilidad, fechas y máximo acumulado por cliente. Crear el pedido pendiente y reservar unidades en la misma transacción.
2. Reclamar la creación del pago de forma atómica. Crear el pago Flow firmado en el servidor, con monto CLP, timeout, confirmación y retorno.
3. Recibir el token por notificación o retorno, o recuperar el estado durante la conciliación. Consultar Flow directamente.
4. Verificar orden comercial, identificador Flow, monto y moneda. Solo una respuesta verificada permite confirmar o rechazar.
5. Si se aprueba, consumir reserva y stock una sola vez, guardar evento y encolar correo. Si se rechaza/anula, liberar la reserva una sola vez. Un pago tardío sin unidades suficientes queda en revisión administrativa.

Los estados visibles son pago pendiente, aprobado, rechazado, reserva vencida y pago en revisión. La preparación y entrega usan un estado separado. Solo se puede preparar o entregar un pedido con pago aprobado.

Cada pedido web conserva `payment_environment` (`sandbox` o `production`). La migración 004 reconoce el ambiente de los anteriores solo cuando su URL pertenece a un host Flow conocido; el resto mantiene `NULL`. Las pruebas sandbox se identifican en el historial, no se suman a métricas comerciales ni se preparan como entregas comerciales en producción. Las consultas y enlaces de pago no cruzan ambientes. El cambio de claves exige resolver antes todos los pendientes del ambiente anterior.

Un error al crear el enlace no provoca automáticamente una segunda creación: el pedido puede haber sido recibido por Flow. La conciliación consulta por `commerceId` si se perdió el token. El sistema tampoco libera por reloj una reserva que podría tener un pago válido: necesita comprobar el resultado con el proveedor. Las reservas que vencieron sin iniciar creación de pago sí pueden liberarse localmente.

La notificación repetida no descuenta stock ni genera de nuevo el evento de aprobación. La deduplicación de correo usa una clave única por evento comercial. Esta protección no significa entrega SMTP exactamente una vez: una interrupción después de que el proveedor acepte un mensaje puede dejar un resultado de envío incierto.

La integración requiere claves propias y una URL HTTPS pública. Las reglas se prueban localmente con respuestas controladas; su funcionamiento real con Flow se valida siguiendo [FLOW-SANDBOX.md](FLOW-SANDBOX.md).

## Entrega y ventas del local

Retiro conserva una copia de la dirección, horario e instrucciones configuradas al comprar. El checkout rechaza retiro si faltan dirección u horario. Envío valida transportista habilitado, destinatario, teléfono, región y comuna, además de dirección o agencia según la modalidad.

Un transportista `collect=true` ofrece envío por pagar: el flete queda fuera del total Flow y el cliente lo paga al transportista. Si `collect=false`, el precio configurado por la tienda se agrega al total. No hay cotización, compra de etiquetas ni seguimiento automático con la API de los transportistas; el administrador registra transportista, número de seguimiento y avance de entrega.

El POS vende artículos de Tienda publicados. Las preventas se reservan desde la cuenta de cliente. El ticket calcula precios y descuentos actuales, guarda el medio recibido y, para efectivo, exige monto suficiente y calcula cambio. La venta completada consume inventario disponible y permanece consultable como pedido con origen `pos`.

## Correo y mantenimiento

Los eventos comerciales escriben mensajes en `mail_outbox` dentro de su transacción. Las rutas solicitan envío después de responder y el cron reintenta pendientes. SMTP procesa lotes pequeños, usa un identificador estable por mensaje y limita los intentos; deben revisarse los errores persistentes. Sin SMTP en desarrollo, el mensaje queda como local y solo el administrador puede leerlo. En producción esa herramienta está deshabilitada.

`/api/jobs/reconcile`, protegido por `CRON_SECRET`, se ejecuta cada minuto desde Supabase Cron/pg_net. `scripts/schedule-reconciliation.ts` configura la tarea y guarda las credenciales en Vault. Su operación se describe en [DEPLOYMENT.md](DEPLOYMENT.md). No se incluye un servicio programador local permanente.

## Pruebas y límites de la validación

La ejecución local termina con **45/45 resultados aprobados**, correspondientes a 43 casos y dos contenedores de suite. Los 29 casos de `store.test.ts` usan PGlite independiente y eliminan la configuración de base remota y SMTP de su proceso. Los nueve casos de `flow.test.ts` sustituyen HTTP para comprobar HMAC, contrato y fallos. Tres casos de `database-config.test.ts` comprueban esquema/TLS; otros dos verifican que la limpieza no acepte nombres productivos ni un esquema sin su marcador.

PGlite serializa su conexión. Por ello se ejecutó además `scripts/verify-postgres.ts` contra PostgreSQL remoto: **9/9 comprobaciones**, tres conexiones simultáneas y persistencia después de cerrar/reabrir el pool. El script usa un esquema aleatorio `sergod_verify_`, crea fixtures propios, simula todo HTTP de Flow y deshabilita correo/Storage. Su `finally` eliminó únicamente ese esquema después de verificar nombre y marcador; no usó los datos de `sergod_store` ni `public`. Véanse [sus instrucciones](../scripts/verify-postgres.md).

La suite de navegador completó 8/8 recorridos sobre una compilación de producción local: subida/optimización real, persistencia tras recargar, permisos, edición, retirada pública, publicaciones, POS, carrito y 18 rutas en computador y celular. La compilación actual y TypeScript también pasaron. El detalle está en [VERIFICATION.md](VERIFICATION.md).

La versión publicada en Vercel pasó el recorrido remoto de productos/preventas con imágenes en Supabase. Flow sandbox produjo pedidos aprobado, rechazado y expirado; el aprobado consumió una unidad una sola vez aun después de cuatro callbacks repetidos. Resend aceptó los correos transaccionales y la tarea programada respondió HTTP 200. La recepción en la bandeja del destinatario es una comprobación distinta. Posteriormente el propietario autorizó Flow producción. Su activación valida credenciales por consulta firmada de solo lectura durante la construcción, sin crear ni pagar una orden; véase [VERIFICATION.md](VERIFICATION.md).

Las construcciones de producción utilizan Webpack. `scripts/verify-build-trace.mjs` verifica dependencias críticas y ausencia de archivos privados en los manifiestos del servidor; esto evita publicar un artefacto incompleto aunque Next.js termine la compilación.
