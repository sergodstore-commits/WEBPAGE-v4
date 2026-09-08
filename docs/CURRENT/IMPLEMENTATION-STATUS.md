# Implementation Status — CODEX-READY V4

> Estado auditado hasta el 2026-09-08. Release productivo `PASS`. Por decisión expresa del
> propietario, Flow es el único proveedor de pago online productivo; Webpay Plus queda fuera de la
> operación V1.

| Área                                                                                 | Estado local verificable | Evidencia                                                                          | Pendiente separado                     |
| ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------- |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y POS | Producción PASS          | Artefacto aceptado promovido; operaciones cliente/Admin trazadas                   | Contenido real a cargo del propietario |
| Orders + Checkout                                                                    | Producción PASS          | Compras `REGULAR` y `PREORDER`, historial, reservas y Flow                         | Ninguno                                |
| Promotions + Loyalty en Order                                                        | Producción PASS          | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL   | Ninguno                                |
| `FREIGHT_COLLECT`                                                                    | Producción PASS          | Costo `0`, fuera del total, sin domicilio y compra PREORDER aceptada               | Ninguno                                |
| Payments Core                                                                        | Producción Flow PASS     | Reconciliación autoritativa e idempotente; Webpay no se ofrece                     | Ninguno                                |
| Flow                                                                                 | Producción PASS          | Credenciales firmadas y sesión productiva real pendiente, sin completar cobro      | Ninguno                                |
| Webpay Plus                                                                          | Fuera de producción V1   | Adaptador histórico probado en Integración, sin credenciales ni opción visible     | Ninguno por decisión del propietario   |
| Fulfillment                                                                          | Producción PASS          | `PENDING → PREPARING → SHIPPED → FULFILLED` con historial remoto                   | Ninguno                                |
| Cuenta cliente                                                                       | Producción PASS          | Perfil, pedidos, preventas, puntos, preferencias, estado y renovación real         | Ninguno                                |
| Admin                                                                                | Producción PASS          | POS y mutaciones críticas compensadas con auditoría                                | Carga operativa del propietario        |
| Comercio público                                                                     | Producción PASS          | Dominio, shell responsive, catálogo, carrito, checkout y Flow                      | Catálogo/contenido del propietario     |
| Editorial                                                                            | Producción PASS          | Editor visual por bloques, imágenes privadas/publicadas y flujo de estados         | Contenido del propietario              |
| Diseño y accesibilidad                                                               | Producción PASS          | Sistema visual aprobado y QA escritorio/móvil de rutas públicas y Admin            | Ninguno                                |
| Notificaciones                                                                       | Producción PASS          | Outbox, worker activo y entrega Resend desde dominio verificado                    | Ninguno                                |
| Despliegue API                                                                       | Producción PASS          | Render Free, Supabase PROD, TLS estricto, sesiones y cuatro jobs verificados       | Ninguno                                |
| Despliegue web                                                                       | Producción PASS          | Vercel `68b4fa5`, dominio canónico, sesión persistente y configuración alineada    | Ninguno                                |
| Aceptación externa final                                                             | PASS                     | Sesión, Flow, Webpay, Resend, limpieza, backup/restore y rollback tienen evidencia | Ninguno                                |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- Runner oficial `scripts/codex/verify-local.ps1 -RunLocalIntegration`: `LOCAL_VERIFICATION=PASS` y salida natural `0` el 2026-08-23.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit, Application, Contract y Web: 109 archivos / 429 pruebas PASS y 1 SKIP documentado.
  Incluye rutas protegidas, restauración, persistencia, renovación/reintento acotado, registro
  idempotente, estado 404 explícito, editor visual por bloques y lectura editorial pública.
- Integration local: 14 archivos / 168 pruebas PASS sobre PostgreSQL 18.4. La migración editorial
  pasó tanto upgrade del baseline como instalación limpia `001`–`022` el 2026-09-02.
- `codex:prepare`: 135 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`022` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- QA manual local: Inicio, Tienda, Editorial, Carrito, Checkout, Cuenta y accesos Admin revisados en escritorio/móvil; sin overflow horizontal y con acciones móviles de al menos 44 px.
- Invariantes focales: `FREIGHT_COLLECT` conserva costo `0`, no requiere domicilio y queda fuera del total; torneos siguen siendo contenido editorial sin motor competitivo.

## Evidencia externa de staging — 2026-08-24 a 2026-08-30

- Render `srv-da3ij5flk1mc7380htcg` sirve el commit auditado `f44837c0d258958ad1d13e078440e06990ba9b47` desde `codex/staging-acceptance`; branch, build de packages/API, health check `/health` y Auto-Deploy `On Commit` fueron reconfirmados.
- Smoke posterior al rollback: `GET /health` y `GET /api/v1/catalog/products?limit=1` respondieron HTTP 200.
- Rollback de código reproducible: `664f24c` → `eb9f084` (`dep-da61q53m8hqs73e9k8h0`) → `664f24c` (`dep-da61qvbncjis73aeu8ig`), con ambos despliegues `live` y smoke HTTP 200. El procedimiento aceptado es `Deploy a specific commit` seguido de restaurar Auto-Deploy; el rollback nativo se descartó porque no conservaba con certeza la configuración vigente.
- Backup lógico de staging verificado mediante restauración desechable: archivo custom de 566.935 bytes, 875 entradas y SHA-256 `065BA71CE3DBADA4B68730A500D484A423B3A1F021533516D01F15154FFD5434`; 22 migraciones, 80 tablas, 80 con RLS, 0 grants públicos y comparación exacta de 673 filas sin diferencias. Los artefactos temporales fueron eliminados.
- Preview Vercel de `codex/staging-acceptance` sirve el build auditado; se verificó sesión Supabase real, persistencia tras recarga y acceso protegido. Producción y dominio permanecen sin promover.
- El commit `87cf5f5` corrigió el contrato de loyalty en Cuenta y añadió recuperación por ruta. La preview volvió a renderizar `/account/overview` con perfil, pedidos, preventas, puntos y preferencias, sin errores de consola.
- El propietario aprobó 106 recursos UI sin texto el 2026-08-25. Se incorporaron con sus bytes originales a `design/approved/ui/` y quedaron registrados por SHA-256 en `design/manifest/APPROVED-UI-ASSETS.json`; 50 variantes con texto horneado permanecen excluidas.
- El commit `2fdc669` reorganizó Administración con una barra lateral fija en escritorio y menú desplegable en móvil. La preview verificó 20 accesos, ancho lateral de 272 px, cero overflow, cero controles menores de 44 px y cero errores de consola; esta estructura sirvió de base para separar las rutas.
- Los commits `aaa7286` y `ec57660` separaron Administración en 10 rutas centrales con consultas acotadas y un único editor pertinente por área. Se probaron todos los enlaces directos, el estado activo, la navegación interna, móvil a 359 px, cero overflow y cero errores de consola.
- Los commits `36550cd` y `05aaa4c` tradujeron estados y tipos únicamente en presentación, abreviaron referencias internas, reemplazaron JSON crudo en Cobertura/POS y repararon las palabras heredadas verificadas con mojibake. La preview confirmó cero estados internos visibles en Catálogo, cero bloques `pre`, cero caracteres `�` y cero overflow; Cobertura y POS mostraron resultados operativos. En móvil a 359 px no hubo overflow ni controles menores de 44 px.
- Los commits `149183d` y `bc354b0` reemplazaron en POS y Cobertura los identificadores editables por selectores alimentados con sucursales, productos, campañas, líneas de venta, cuentas y medios reales. Las pruebas focales verificaron que se conservan los identificadores exactos enviados a la API. La preview mostró la dirección y el medio de pago persistidos, cero campos editables de identificadores, cero errores de consola y cero overflow; a 359 px tampoco hubo controles menores de 44 px.
- El E2E remoto trazable `ACCEPT-E2E-MTCV00OP` creó, editó y eliminó un medio externo temporal desde POS. La limpieza se comprobó mediante la ausencia del identificador en los selectores y en la consulta actualizada de medios; no hubo errores de consola. Este PASS cubre ese CRUD administrativo, no sustituye los recorridos pendientes de venta, cuenta, pedidos o proveedores.
- Los commits `718dd77` y `a77b93a` corrigieron la selección de registros administrativos para priorizar el identificador propio ante relaciones como categoría, producto o promoción, y alinearon el juego con el `gameId` real del API. El runner restringido a staging completó `ACCEPT-POS-E2E-20260828145219`: publicó temporalmente la cadena técnica existente, registró una unidad, completó la venta regular con referencia auditable, verificó un único movimiento `POS_SALE_CONSUMED`, restauró stock/reservas a `0/0` y despublicó toda la cadena. El preflight posterior confirmó el estado restaurado.
- Se detectó que el `.env` local y el runner POS aún apuntaban al servicio Render antiguo `sergod-api-6f8c2a91-2026.onrender.com`, cuyo contrato rechazaba `orderType`. El destino se alineó con `sergod-store-api-v4.onrender.com`, ya usado por el rewrite de Vercel. En el servicio vigente, login devolvió sesión y `GET /api/v1/orders` para `REGULAR`/`PREORDER`, además de la variante Admin, respondieron HTTP 200; perfil, preferencias y loyalty también respondieron 200. El preflight POS volvió a pasar con stock/reservas `0/0`.
- El POS administrativo se reorganizó como una caja visual de dos paneles: catálogo con imágenes, búsqueda y filtros por juego a la izquierda; ticket con cantidades editables, eliminación, cliente, beneficios, total y cobro a la derecha. Conserva los contratos operativos existentes y adapta la referencia entregada por el propietario a la identidad visual aprobada. La verificación completa pasó con 105 archivos de prueba, 398 pruebas aprobadas y 1 omisión documentada.
- La comprobación posterior a producción detectó que Cobertura devolvía únicamente información pública ya creada y ocultaba la sucursal activa inicial, bloqueando tanto su primera configuración como la apertura del POS. La lectura administrativa ahora expone por separado las sucursales activas sin modificar datos; POS y Cobertura consumen esa lista con compatibilidad hacia la respuesta anterior. La integración PostgreSQL focal pasó 4 pruebas y confirmó que la sucursal activa aparece aun sin información pública.
- La sonda comparativa posterior reveló que el dominio web todavía reenviaba `/api/*` al servicio Render anterior, mientras los runners y la configuración vigente ya usaban `sergod-store-api-v4.onrender.com`. Se alinearon el rewrite de Vercel y el inventario operativo con el servicio vigente para eliminar la mezcla de API/Supabase que vaciaba la sucursal y podía invalidar sesiones.
- Tras alinear API y clave pública de Supabase, el navegador aún conservaba el almacenamiento de sesión creado contra el proyecto anterior. La clave local de persistencia se versionó a `sergod-store-auth-v2` para aislar ese estado incompatible sin inspeccionarlo ni reutilizarlo; los nuevos inicios de sesión mantienen persistencia y renovación sobre producción.
- Los fixtures técnicos visibles fueron despublicados de forma trazable: 3 productos, 1 campaña, 1 colección, 1 categoría y 1 juego. El catálogo público queda vacío hasta que el propietario cargue productos reales desde Admin.
- La identidad `CLIENTE` preparada por el propietario estaba confirmada en Supabase, pero la verificación interna seguía `PENDING`. Se reconcilió mediante el callback oficial de la aplicación, sin escritura SQL directa, y quedó `VERIFIED`, enlazada a una única cuenta `CLIENTE` activa y sin reconciliaciones abiertas.
- `scripts/codex/remote-client-account-acceptance.ps1` completó `CLIENT_ACCOUNT_ACCEPTANCE=PASS` contra `sergod-store-api-v4.onrender.com`: pedidos regulares `0`, preventas `0`, movimientos de loyalty `0` y lectura de preferencias PASS. El proveedor de identidad ahora distingue credenciales inválidas (`401`), correo pendiente (`409`) e indisponibilidad real (`503`), y el formulario conserva una clave idempotente para impedir dobles altas o mensajes engañosos por reenvío.
- Flow sandbox completó `ACCEPT-FLOW-E2E-20260830021449` para `SG-2026-000005`: `PAYMENT_STATUS=SUCCEEDED`, `ORDER_STATUS=PAID` y `REMOTE_FLOW_CLEANUP=PASS`. La aceptación verificó el estado directamente con Flow y luego contra la API/DB; el retorno del navegador no se usó como autoridad. Durante la prueba se corrigieron dos defectos reales de persistencia (`42702` por `version` ambiguo y monto numérico de Flow recibido como texto). El adaptador también envía `timeout` alineado con la expiración de la reserva para impedir pagos tardíos.
- El trabajador transaccional de staging se activó con los parámetros ejecutables ya cubiertos por el contrato del repositorio. Procesó seis mensajes acumulados destinados exclusivamente a la cuenta cliente de aceptación: PostgreSQL quedó con `6/6 SENT`, sin pendientes ni destinatarios ajenos, y Resend confirmó los seis como `delivered`, incluido `Pago confirmado para SG-2026-000005`.
- `scripts/codex/remote-session-renewal-acceptance.mjs` reprodujo de forma aislada el flujo real del navegador contra staging: login por la API, persistencia con Supabase, cuenta HTTP 200, token deliberadamente alterado HTTP 401, renovación forzada, nuevo token HTTP 200 y rotación del refresh token. La prueba no dependió de esperar la expiración natural ni alteró otras sesiones abiertas.
- `scripts/codex/remote-preorder-freight-acceptance.mjs` completó `ACCEPT-PREORDER-FREIGHT-20260830141613` para `SG-2026-000007`: PREORDER, `FREIGHT_COLLECT`, $10.000 CLP, Flow `SUCCEEDED`, Order `PAID` y fulfillment `PENDING → PREPARING → SHIPPED → FULFILLED`. La reconciliación fue servidor-a-servidor; el runner verificó el compromiso de preventa, cerró la campaña, despublicó los fixtures técnicos y terminó con `REMOTE_PREORDER_FREIGHT_CLEANUP=PASS`. Antes del recorrido definitivo, el job oficial expiró y limpió correctamente la orden técnica fallida `SG-2026-000006`, confirmando además la liberación de su reserva.
- `scripts/codex/remote-admin-core-acceptance.mjs` completó `ACCEPT-ADMIN-CORE-20260830143421`: edición/restauración del producto técnico, desactivación/reactivación de la cuenta cliente, ciclo activo/cancelado de promoción y cupón, corrección loyalty `+1/-1`, edición y activación de configuraciones loyalty/sistema con el mismo valor operativo, y contenido editorial publicado/archivado. El estado público quedó limpio, los valores operativos originales se conservaron y se verificaron 7 entradas de auditoría trazadas. Una nueva sesión cliente y su renovación volvieron a pasar después de la reactivación.
- `scripts/codex/remote-webpay-acceptance.mjs` completó `ACCEPT-WEBPAY-E2E-20260830185032` para `SG-2026-000008` por $3.100 CLP: el ambiente oficial de Integración autorizó la transacción, la reconciliación servidor-a-servidor confirmó `PAYMENT_STATUS=SUCCEEDED`, la Order terminó `PAID` y el inventario/fixtures técnicos volvieron a su estado original con `REMOTE_WEBPAY_CLEANUP=PASS`. El retorno del navegador no se usó como autoridad.

## Evidencia de producción — 2026-09-01

- Supabase PROD `kbhbaackrgwgvxxqdlwx` conserva 21 migraciones, 81 tablas públicas y RLS en las
  80 tablas de aplicación. Render conecta mediante pooler IPv4 con TLS estricto y CA oficial.
- Los cuatro jobs de lifecycle/expiración están programados cada cinco minutos mediante Supabase
  Cron y `pg_net`; Cron, HTTP y ejecución de aplicación registraron `PASS` sin fallos.
- El backup lógico productivo cifrado fue restaurado en una base desechable: 81 tablas y cero
  diferencias bloqueantes. El texto plano y la base temporal fueron eliminados.
- La sesión administrativa productiva pasó login, cuenta, autorización Admin, rechazo de token
  inválido y renovación. Resend entregó el correo técnico correlacionado en un intento y el outbox
  de prueba quedó limpio.
- Flow producción validó credenciales mediante una consulta firmada y creó la sesión técnica
  `SGDTECHMTIEKY4V` por $1.000 CLP. Flow devolvió HTTP 200 y estado pendiente; la URL no se abrió y
  no se completó ningún cobro.
- El propietario decidió el 2026-09-01 operar exclusivamente con Flow. Render no contiene
  credenciales Webpay y el checkout deja de presentar ese proveedor; el adaptador y su evidencia
  histórica de Integración se conservan sin activar.
- La API productiva pasó nuevamente sesión administrativa y mantenimiento después de activar Flow.
  Vercel promovió `c5f97bd`; `www.sergodstore.cl/shop` cargó el catálogo productivo sin error.
- El rollback instantáneo productivo cambió temporalmente `c5f97bd` por `2358111`; el dominio
  respondió correctamente durante la reversión y `c5f97bd` se restauró inmediatamente. Vercel
  confirmó el release restaurado y ningún rollback activo.

## Verificación productiva posterior — 2026-09-02

- Render y Vercel quedaron alineados exclusivamente con Supabase PROD `kbhbaackrgwgvxxqdlwx`.
  La API verificó conexión PostgreSQL con la CA oficial, cuenta `ADMIN` activa y confirmada, y
  tokens emitidos por el mismo proyecto; el bundle público contiene la URL y clave pública
  esperadas, sin referencias al proyecto de staging.
- Vercel promovió `0d29388` a Producción y asignó `www.sergodstore.cl`. El inicio de sesión real
  llegó a Cuenta, permaneció activo tras la espera y permitió navegar directamente a `/admin/pos`
  sin regresar al acceso.
- Se recuperaron del entorno anterior los datos reales de la única sucursal y se inicializó mediante
  `/api/v1/admin/branches/initialize` con idempotencia: `Sergod Store`, Los Carrera 5142, Copiapó,
  `America/Santiago`. La lectura posterior confirmó exactamente una sucursal y el POS habilitó
  “Abrir venta”; no se abrió ni registró ninguna venta durante esta comprobación.
- El editor editorial dejó de depender de un único campo de texto: noticias, torneos, comunidad,
  cómics, quests y Hall of Fame aceptan bloques ordenables de texto e imagen, alineación
  izquierda/centro/derecha/ancho completo, tres tamaños y vista previa. Los recursos permanecen
  privados durante el borrador y solo se entregan públicamente si la publicación está publicada y
  todavía referencia la imagen.
- Antes del cambio se creó el respaldo productivo cifrado
  `sergod-production-public-20260902-094716.dump.aes`; su restauración desechable comparó 81 tablas
  y 1.633 filas sin diferencias. Supabase PROD aplicó la migración `022_editorial_media` y verificó
  22 migraciones, tabla nueva con RLS y asociaciones editoriales inmutables.
- Render dejó `1734412` live en el despliegue `dep-dac2nce8bjmc73chsfc0`. Vercel promovió el mismo
  commit mediante el deployment `7XXnUjaeuu9W6mYdt4gRCWL49WqC`; el dominio productivo conservó la
  sesión Admin, mostró “Diseñar publicación”, respondió salud/catálogo HTTP 200 y no registró
  errores de consola. La prueba no creó contenido ni subió archivos a producción.
- El commit `f3b36d2` eliminó de la interfaz la complejidad de múltiples sucursales: POS, retiro,
  preventas, loyalty y atención usan automáticamente la única tienda activa, sin pedir códigos
  internos. El gate completo pasó con 108 archivos, 409 pruebas aprobadas y 1 omisión documentada.
  Render lo dejó live en `dep-dafc40favr4c73bukfog` y Vercel lo promovió a Producción mediante
  `FVQReytafXMkVaKsho81hf38WALz`; la sesión Admin persistió tras recargar el dominio.
- La atención de `Sergod Store` quedó publicada con dirección `Los Carrera 5142, Copiapó`, horario
  `10:00 a 22:00`, teléfono `+56934423169` y correo `sergodstore@gmail.com`, exactamente como indicó
  el propietario. `GET /api/v1/service-coverage/store` respondió HTTP 200 desde el dominio y entregó
  esos datos a checkout; indicaciones y mapa permanecen nulos, sin contenido inventado.
- El catálogo administrativo se reorganizó en tres tareas directas: `Nuevo producto`,
  `Editar producto` e `Imágenes`. La galería carga al seleccionar la entidad, permite vista previa,
  portada y orden, y conserva la administración técnica dentro de controles plegados. La corrección
  adicional `27597c7` impide que las tablas genéricas desplacen estas tareas en pantallas pequeñas.
  El gate completo pasó con 109 archivos, 411 pruebas aprobadas y 1 omisión documentada; la API
  respondió salud HTTP 200 y autenticación HTTP 401 en la ruta privada sin sesión.
- Vercel promovió `27597c7` a Producción mediante el deployment
  `8MULAfLEY383LExzXbbaMvXBwVVd`. `www.sergodstore.cl/admin/catalog` conservó la sesión Admin,
  mostró las tres tareas antes de las herramientas avanzadas, permitió alternarlas y no registró
  errores ni advertencias de consola. La comprobación no creó productos ni modificó datos.
- El commit `77fe685` simplificó transversalmente el panel Admin: reorganizó el menú con nombres
  operativos, reemplazó el resumen decorativo por accesos a tareas frecuentes, separó
  Pedidos/Pagos/Entregas y Crear/Editar/Estados en vistas únicas, dividió las operaciones de
  inventario y añadió búsqueda y estados legibles a Clientes y usuarios. No eliminó capacidades ni
  alteró contratos de servidor. El gate completo pasó con 109 archivos, 414 pruebas aprobadas y 1
  omisión documentada.
- Vercel promovió `77fe685` a Producción mediante el deployment
  `8BiMA1NigHE14pZ2HWdGFZ56s9u5`. La sesión Admin persistió al navegar por Resumen, Pedidos,
  Inventario, Publicaciones y Clientes y usuarios; todas las pestañas seleccionadas mostraron su
  tarea correspondiente y el navegador registró cero errores y advertencias. Web y API respondieron
  HTTP 200. La comprobación no ejecutó acciones administrativas ni modificó datos.
- El propietario solicitó acumular las mejoras públicas y promoverlas una sola vez. Los commits
  `f2eec59`–`68b4fa5` completaron Inicio, detalle de Tienda, Torneos, Noticias, Comunidad y Cómics:
  Inicio consume destacados reales; Tienda expone galería y detalle público; Torneos separa
  próximos, realizados, Quests y Hall of Fame; Noticias incorpora portada y categorías; Comunidad
  combina actividades con la información publicada de la única tienda; y Cómics relaciona series y
  capítulos con lector por bloques e imágenes. Los contenidos históricos sin los nuevos metadatos
  permanecen visibles en grupos explícitos, sin inferir clasificaciones.
- El gate integral del conjunto terminó con 109 archivos, 429 pruebas aprobadas y 1 omisión
  documentada; formato, lint, tipos y compilación productiva pasaron. `main` avanzó linealmente desde
  `95b5730` hasta `68b4fa5`, sin secretos, `.env`, migraciones ni cambios de esquema. El dominio
  productivo y la API respondieron HTTP 200; Inicio, Tienda, Torneos, Noticias, Comunidad, Cómics y
  Publicaciones Admin se comprobaron con sesión persistente y cero errores o advertencias. En Admin
  se verificaron los campos dinámicos sin guardar ni modificar contenido. El release anterior se
  conserva como rollback de deployment.
- El commit local `08de606` prepara la biblioteca operativa de imágenes sin promoverla todavía:
  mantiene `catalog-assets` privado y organiza cada carga nueva en carpetas virtuales por área y
  registro (`products`, `games`, `categories`, `collections`, `news`, `tournaments`, `community`,
  `comics`, `quests` y `hall-of-fame`). Las claves históricas en la raíz siguen siendo compatibles y
  no se movió ni eliminó ningún objeto. La galería Admin acepta selección múltiple o arrastre,
  muestra cada vista previa, exige descripción accesible individual y conserva portada, orden,
  reemplazo e historial. El gate integral pasó con 111 archivos, 438 pruebas aprobadas y 1 omisión;
  la integración focal de catálogo pasó 21 pruebas sobre PostgreSQL local. No requirió migración.
- El commit local `6afcdc4` completa el primer punto previo a la promoción conjunta: el API procesa
  automáticamente las imágenes comerciales y editoriales antes de guardarlas. Conserva JPEG, PNG,
  WebP o AVIF, respeta proporción, nunca agranda una imagen y adopta el resultado únicamente cuando
  ocupa menos espacio; si una imagen grande admite reducción segura, limita su dimensión mayor a
  2.400 px. El flujo no toca el logo ni los assets versionados de diseño y mantiene validación de
  firma, extensión, dimensiones, píxeles, hash, autorización e idempotencia. El gate integral pasó
  con 111 archivos, 446 pruebas aprobadas y 1 omisión; la suite oficial PostgreSQL pasó 14 archivos y
  169 pruebas. No requirió migración ni escritura remota.
- El commit local `33ea490` completa el segundo punto previo a la promoción conjunta: la
  reconciliación privada informa bytes y cantidad de objetos activos, retenidos por historial y
  huérfanos, además de sus anomalías e integridad. Retirar o reemplazar una imagen conserva el
  objeto privado y su trazabilidad, sin devolverlo al catálogo público ni borrarlo automáticamente;
  los huérfanos se detectan y contabilizan, pero tampoco se eliminan sin una decisión posterior
  explícita. La integración focal pasó 21 pruebas sobre PostgreSQL con el optimizador real; formato,
  lint, tipos y compilación API pasaron. No requirió migración ni escritura remota.

## `DEFERRED_EXTERNAL` — no son PASS

No quedan comprobaciones externas diferidas ni gates de Release pendientes. La carga del catálogo y
del contenido real desde Admin es operación del propietario, no una carencia técnica ni un fixture de
aceptación que deba publicarse.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
