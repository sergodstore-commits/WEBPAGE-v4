# Implementation Status — CODEX-READY V4

> Estado auditado hasta el 2026-09-13. Release productivo en `c1ccd5a`; el registro CLIENTE vuelve a
> estar habilitado con aceptación obligatoria y versionada de los Términos y condiciones 1.0. Por
> decisión expresa del
> propietario, Flow es el único proveedor de pago online productivo; Webpay Plus queda fuera de la
> operación V1.

| Área                                                                                 | Estado local verificable | Evidencia                                                                          | Pendiente separado                   |
| ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------ |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y POS | Producción PASS          | Login Admin PASS; registro CLIENTE habilitado con aceptación legal 1.0             | Alta operativa de cuentas reales     |
| Orders + Checkout                                                                    | Producción PASS          | Compras `REGULAR` y `PREORDER`, historial, reservas y Flow                         | Ninguno                              |
| Promotions + Loyalty en Order                                                        | Producción PASS          | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL   | Ninguno                              |
| `FREIGHT_COLLECT`                                                                    | Producción PASS          | Costo `0`, fuera del total, sin domicilio y compra PREORDER aceptada               | Ninguno                              |
| Payments Core                                                                        | Producción Flow PASS     | Reconciliación autoritativa e idempotente; Webpay no se ofrece                     | Ninguno                              |
| Flow                                                                                 | Producción PASS          | Credenciales firmadas y sesión productiva real pendiente, sin completar cobro      | Ninguno                              |
| Webpay Plus                                                                          | Fuera de producción V1   | Adaptador histórico probado en Integración, sin credenciales ni opción visible     | Ninguno por decisión del propietario |
| Fulfillment                                                                          | Producción PASS          | `PENDING → PREPARING → SHIPPED → FULFILLED` con historial remoto                   | Ninguno                              |
| Cuenta cliente                                                                       | Producción PASS          | Perfil, pedidos, preventas, puntos, preferencias, estado y renovación real         | Ninguno                              |
| Admin                                                                                | Producción PASS          | POS y mutaciones críticas compensadas con auditoría                                | Carga operativa del propietario      |
| Comercio público                                                                     | Producción PASS          | Dominio, shell responsive, catálogo, carrito, checkout y Flow                      | Catálogo/contenido del propietario   |
| Editorial                                                                            | Producción PASS          | Editor visual por bloques, imágenes privadas/publicadas y flujo de estados         | Contenido del propietario            |
| Diseño y accesibilidad                                                               | Producción PASS          | Sistema visual final, editor por capas y responsive verificados                    | Carga visual del propietario         |
| Notificaciones                                                                       | Producción PASS          | Outbox, worker activo y entrega Resend desde dominio verificado                    | Ninguno                              |
| Despliegue API                                                                       | Producción PASS          | Render Free, Supabase PROD, TLS estricto, sesiones y cuatro jobs verificados       | Ninguno                              |
| Despliegue web                                                                       | Producción PASS          | Vercel `c1ccd5a`, dominio canónico, sesión persistente y configuración alineada    | Ninguno                              |
| Aceptación externa final                                                             | PASS                     | Sesión, Flow, Webpay, Resend, limpieza, backup/restore y rollback tienen evidencia | Ninguno                              |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- Runner oficial `scripts/codex/verify-local.ps1 -RunLocalIntegration`: `LOCAL_VERIFICATION=PASS` y salida natural `0` el 2026-08-23.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit, Application, Contract y Web: 116 archivos / 478 pruebas PASS y 1 SKIP documentado.
  Incluye rutas protegidas, restauración, persistencia, renovación/reintento acotado, registro
  idempotente, estado 404 explícito, editor visual por bloques y lectura editorial pública.
- Integration local: 14 archivos / 169 pruebas PASS sobre PostgreSQL 18.4. La migración de apariencia
  pasó tanto upgrade del baseline como instalación limpia `001`–`023` el 2026-09-12.
- `codex:prepare`: 135 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`023` y mirrors Supabase son prospectivas.
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
- El commit local `d06be4c` completa los puntos tercero y cuarto: las cargas múltiples bloquean el
  doble envío, conservan la misma clave idempotente al reintentar, eliminan de la cola solo las fotos
  confirmadas y mantienen visible el resultado de un fallo parcial. Antes de subir, cada foto puede
  quitarse individualmente sin seleccionar de nuevo el lote; las posiciones restantes se recalculan
  y sus vistas previas se liberan. Las 21 pruebas focales del panel, formato, lint y tipos pasaron.
- El commit local `f5a3014` completa el quinto punto de seguridad local: una falla del optimizador
  deja el registro en cuarentena, no escribe bytes en Storage y nunca activa la imagen. Junto con las
  pruebas existentes de firma real, MIME, dimensiones, clave segura y Storage privado, pasaron 9
  pruebas de aplicación y 29 pruebas unitarias focales. No hubo escritura remota.
- El sexto punto cerró el gate acumulado local: `verify` pasó formato, lint, tipos, 111 archivos de
  pruebas con 448 aprobadas y 1 omisión documentada, además de la compilación productiva. La suite
  PostgreSQL oficial pasó 14 archivos y 169 pruebas; el historial confirmó 31 migraciones protegidas,
  la auditoría de entrega no encontró vacíos, entornos reales ni placeholders y `npm audit` informó
  0 vulnerabilidades de producción. La instancia PostgreSQL desechable quedó apagada. El conjunto
  continúa exclusivamente local, pendiente de una única subida a Preview y aceptación real antes de
  cualquier promoción productiva.

## Hallazgo productivo cerrado — 2026-09-09

- `GET /api/v1/identity/registration/legal-documents` responde HTTP 200 con `documents: []`; la
  pantalla de registro muestra correctamente «El registro aún no está habilitado» y no permite
  crear cuentas sin una aceptación legal verificable.
- El único antecedente localizado en el Supabase antiguo `skhsmsgmceldmapdvcqo` era un fixture que
  apuntaba a `https://example.com/sergod-store/terms-v1`. No se migró a producción porque no es un
  documento legal real y CURRENT prohíbe convertir placeholders en alcance o evidencia.
- El propietario aprobó expresamente el 2026-09-09 el texto preparado como versión 1.0, con vigencia
  desde esa fecha e identificación de Francisco Javier Pizarro Ávila, persona natural, RUT
  19.910.774-7, domicilio legal en Los Carrera 5142, Copiapó. La página pública está preparada en
  `/legal/terms` dentro del lote local, sin afirmar una revisión jurídica profesional inexistente.
- La Preview `sergod-store-v4-58cl2gtgu-sergod-store.vercel.app` quedó `Ready` y la revisión visual
  verificó la versión, identidad, contacto y las 17 secciones. Vercel publicó `8c16c66` en producción
  mediante el deployment `9dMDkoNUuwcN5Xu1KNUg16tQ3Nsy`; Render dejó el mismo commit `Live` en
  `dep-dagdinflk1mc73cvqffg`, conservando los despliegues anteriores como rollback.
- El flujo administrativo creó y activó exactamente un documento obligatorio, “Términos y
  condiciones”, versión 1.0, cuya ubicación es `https://www.sergodstore.cl/legal/terms`. La consulta
  pública devolvió esa configuración y `/register` reemplazó el bloqueo por la casilla obligatoria
  “Acepto Términos y condiciones · 1.0”. No se creó una cuenta ni se aceptó el contrato en nombre de
  un cliente.
- La primera confirmación de correo creada por el propietario verificó la identidad en Supabase,
  pero terminó en `localhost` porque Auth conservaba `http://localhost:3000` como Site URL y Render
  aún publicaba una Preview antigua como `WEB_APP_URL`. Supabase PROD quedó limitado al dominio
  oficial y a los callbacks exactos de confirmación, recuperación y cambio de correo. Render quedó
  `Live` en `dep-dagdru0u01pc73fe2u7g` con `WEB_APP_URL=https://www.sergodstore.cl`.
- La identidad `animeloco221345@gmail.com`, creada y confirmada personalmente por el propietario,
  se reconcilió mediante el callback oficial de la aplicación. La comprobación posterior confirmó
  una única cuenta `CLIENTE`, estado `ACTIVE` y verificación interna `VERIFIED`; no se efectuó
  escritura SQL directa ni se registró una aceptación contractual en su nombre.
- La copia privada `.runtime/codex/sergod-production.env` se volvió a sincronizar desde el servicio
  Render final, conservando un respaldo previo. La validación confirmó que API y web apuntan al
  Supabase PROD `kbhbaackrgwgvxxqdlwx`, al dominio oficial y a las mismas credenciales Flow de
  producción, sin exponer valores secretos en evidencia.
- El cierre técnico `3cd66ad` quedó `Ready` en Vercel mediante
  `KqE38CgJyuwaLNZrhPQEXcfSgJnq` y `Live` en Render mediante `dep-dagelo3ncjis73bnc9cg`.
  El smoke productivo verificó `/health`, catálogo, contenido, Inicio, Login, Registro y POS con
  HTTP 200, además de CSP, HSTS, `Permissions-Policy`, `Referrer-Policy`, `nosniff` y protección de
  framing. La aceptación de autenticación pasó login, persistencia, renovación, cierre e
  invalidación de sesión y solicitud de recuperación.
- El gate local final pasó 111 archivos y 449 pruebas (1 omisión documentada), build completo y
  auditoría de dependencias con 0 vulnerabilidades. `sharp` quedó en 0.35.4 y `vitest` en 4.1.11.
- La limpieza externa dejó un único destino por plataforma: Supabase
  `sergod-store-production` (`kbhbaackrgwgvxxqdlwx`), Vercel `sergod-store-v4` y Render
  `sergod-store-api-v4` (`srv-da3ij5flk1mc7380htcg`). Se eliminaron los Supabase antiguos
  `sergod-store` y `sergod-store-web-v1`, y el proyecto Vercel antiguo `sergod-store`; el servicio
  Render histórico ya no existía. No se tocó ningún recurso productivo final.

## Auditoría funcional acumulada — 2026-09-11

- La carga y edición real de imágenes de producto se comprobó contra producción: el objeto privado,
  sus metadatos y la portada sobrevivieron nuevas lecturas. El editor de catálogo ahora solicita el
  idioma como código internacional y valida ejemplos como `es-CL`; la galería distingue la carga
  pendiente de una imagen realmente no disponible.
- La carga editorial real conservó imagen, ajuste y tamaño, y una nueva lectura confirmó su
  persistencia. Se corrigió el uso tardío del formulario después de la operación asíncrona, que podía
  mostrar un error al intentar limpiarlo pese a que la imagen ya se había guardado.
- Inventario informa de forma accionable cuando falta el único dato operativo aún no definido por el
  propietario: el umbral global de últimas unidades. La API devuelve conflicto de configuración en
  vez de presentarlo como dependencia caída, y Admin indica exactamente dónde activarlo.
- La aceptación reversible `ACCEPT-POS-FUNCTIONAL-20260911051801` completó una venta regular POS,
  validó su consumo de stock y restauró producto, inventario, recursos auxiliares, configuración y
  medio temporal. Dos ventas técnicas incompletas de intentos previos quedaron descartadas mediante
  la API normal; la venta aprobada permanece como evidencia auditable.
- La aceptación reversible `ACCEPT-COMMERCE-20260911052153` comprobó catálogo e imagen públicos,
  detalle de producto, inicio de sesión CLIENTE, alta y actualización del carrito, persistencia tras
  releerlo, selección de retiro y revalidación de checkout. No creó un pedido ni inició un cobro; la
  línea, el stock, las publicaciones, las imágenes auxiliares y la configuración temporal quedaron
  restaurados.
- El gate acumulado pasó formato, lint, tipos, 111 archivos de pruebas con 450 aprobadas y 1 omisión
  documentada, y compilación productiva completa. Las 80 pruebas focales de navegación, cuenta,
  catálogo, imágenes, carrito, checkout, inventario y POS también pasaron.
- GitHub publicó `3c3dd12` en `main`; Render lo dejó `Live` en
  `dep-dahp2mqd0e5s73bucf3g` y Vercel sirvió el paquete `index-CCSn4E_5.js` con las correcciones.
  El smoke posterior confirmó redirección canónica a `www`, HTTP 200 y ausencia de referencias a los
  proyectos Supabase antiguos.
- La limpieza final archivó el producto `ACCEPT-FUNC-20260910`, retiró su recurso activo y archivó
  `PRUEBA TEMPORAL EDITORIAL CODEX 20260910`. La comprobación SQL de solo lectura confirmó stock y
  reservas `0/0`, todas las configuraciones y medios temporales retirados, y las dos ventas de intentos
  fallidos en `DISCARDED`; las ventas aprobadas permanecen `COMPLETED` como evidencia inmutable.
- El propietario fijó el umbral operativo de últimas unidades en `3`; la versión productiva fue creada,
  activada y releída mediante la API administrativa. También aclaró que el POS se usa para registrar la
  venta física y descontar el inventario compartido, nunca para procesar el pago. La interfaz lo declara
  expresamente y presenta el medio recibido solo como referencia auditable de un pago efectuado fuera
  de la página, conforme a las reglas POS de CURRENT. Producción dejó activa una única opción
  `VENTA_PRESENCIAL`, descrita como pago fuera de la página y sin integración con un proveedor.

## Renovación visual final local — 2026-09-11

- Se incorporó una capa visual transversal basada exclusivamente en recursos sin texto de la biblioteca
  aprobada. Los derivados técnicos provienen del material 4x entregado por el propietario, se publican
  como WebP y conservan separados los originales. El logo oficial no fue modificado.
- Inicio, navegación, Tienda, Torneos, Noticias, Comunidad, Cómics, carrito, checkout, cuenta, Admin y
  POS comparten ahora el lenguaje gráfico negro/rojo/blanco con acento cian, tramas, marcos, cortes y
  ornamentos angulares. La composición mantiene todo el contenido y las acciones como HTML accesible;
  no usa rótulos horneados ni altera contratos, estados o reglas de negocio.
- La biblioteca pública contiene 37 derivados utilizados, con un peso total aproximado de 3,2 MB. Una
  prueba automática verifica que cada URL visual resuelva a un archivo existente, que no queden recursos
  sin uso y que no ingresen las variantes rechazadas con texto.
- La revisión visual local comprobó Inicio en escritorio y móvil, además de Tienda y Noticias en
  escritorio. Corrigió una superposición móvil del panel informativo y confirmó navegación, jerarquía,
  estados vacíos y ausencia de cortes en el ancho móvil fiable del navegador de captura.
- El gate integral local pasó formato, lint, tipos, 112 archivos de pruebas con 452 aprobadas y 1 omisión
  documentada, y compilación productiva completa. Un primer intento agotó por 395 ms el límite de una
  prueba API no afectada; la prueba focal pasó en 241 ms y la repetición completa terminó verde. Este
  conjunto permanece local y todavía no ha sido promovido a Preview ni Producción.

## Corrección visual y apariencia administrable — 2026-09-12

- El propietario rechazó la composición de la Preview anterior por recursos deformados o recortados,
  ubicación incorrecta de adornos, logo con rectángulo negro, tipografía genérica y una portada que no
  comunicaba suficientemente la idea de launcher. Esta aceptación prevalece sobre el QA técnico anterior:
  la renovación del 2026-09-11 ya no se considera visualmente aprobada.
- El archivo oficial del logo se conserva intacto. Como la fuente aprobada está codificada realmente como
  JPEG sin canal alfa pese a su extensión `.png`, la web usa un derivado técnico WebP con transparencia;
  cabecera y pie dejaron de mostrar el rectángulo negro sin recortar, recolorear o sustituir el original.
- Los marcos y banners dejaron de estirarse a `100% × 100%`. Se retiraron seis derivados que quedaron sin
  uso y los adornos restantes se muestran con proporción conservada. La portada local adopta una estructura
  de launcher con accesos reales a Tienda, Torneos, Noticias, Comunidad y Cómics; los rótulos continúan como
  texto HTML accesible y no como palabras horneadas en imágenes.
- Por solicitud expresa del propietario se añadió `/admin/appearance` para Portada, Tienda, Torneos,
  Noticias, Comunidad y Cómics. Cada sección conserva capas independientes de texto o recursos aprobados
  que se pueden arrastrar, redimensionar, ordenar, ocultar en móvil, quitar y publicar. Las capas de orden
  0–4 quedan detrás del contenido y las de orden 6–30 pueden superponerse; los controles comerciales y la
  navegación permanecen protegidos fuera del documento editable.
- La apariencia se persiste como configuración global `WEB_APPEARANCE_LAYOUT`, validada contra un esquema
  cerrado (máximo 24 capas por sección, seis recursos aprobados, posiciones y profundidades acotadas), con borrador,
  activación, historial, autorización ADMIN, idempotencia y auditoría existentes. La lectura pública expone
  únicamente la versión activa; no publica actores, motivos ni historial administrativo.
- La migración prospectiva `023_web_appearance_configuration` pasó actualización `001–022 → 023` y una
  instalación limpia `001 → 023` sobre PostgreSQL 18.4. El historial protegido conservó sus 31 archivos sin
  cambios. El gate integral pasó formato, lint, tipos, 115 archivos de prueba, 462 pruebas aprobadas y 1
  omisión documentada, además de la compilación productiva. Administración y el editor de apariencia se
  cargan bajo demanda: el paquete inicial bajó a 333,61 kB y la compilación dejó de advertir por tamaño. El
  conjunto continúa solo local: requiere despliegue de API/Preview y aceptación visual antes de cualquier
  promoción a producción.

## Revisión del editor y cierre local — 2026-09-12

- Se impide editar/publicar mientras carga la apariencia o si la lectura falla, para no sustituir una
  versión existente por un documento vacío. Los reintentos conservan borrador y clave de activación;
  se bloquea el doble envío, se limita la cantidad de capas y se valida el documento antes de publicar.
- Las capas se pueden seleccionar con teclado y los textos públicos permanecen accesibles. La prueba
  PostgreSQL focal aprobó 8 casos, incluida persistencia desde un lector nuevo, borrador no público y
  activación idempotente. Las seis pruebas del editor aprobaron carga, reintento y nueva lectura.
- Se corrigió el título del launcher para ajustarlo al ancho real de su columna y la posición de las
  capas que una regla CSS heredada alteraba. La revisión local de Inicio comprobó escritorio y anchos
  de 390/768 px; no hubo desbordamiento horizontal ni imágenes rotas en la lectura móvil. Las consultas
  comerciales locales no disponían de API activa: esta revisión visual no certifica contenido remoto.
- El gate integral aprobó formato, lint, tipos, 115 archivos, 465 pruebas y una omisión documentada,
  además de compilación API/web sin advertencia de tamaño.
- Pendientes concretos: completar la revisión visual Admin y realizar la aceptación remota del
  guardado. No se
  considera terminado el editor libre solicitado. El bloque permanece local y no está desplegado.

- Continuación del 2026-09-12: el editor incorpora una lista ordenada de capas para seleccionar
  elementos tapados, consultar su orden/visibilidad y quitarlos de forma individual. El área de dibujo
  se identifica como esquema de capas, ya que todavía no representa una vista previa fiel del sitio.
  Pasaron siete pruebas focales del editor y la compilación web con verificación de tipos.
- La integración local completa terminó correctamente en 244 segundos: 14 archivos y 170 pruebas
  aprobadas. Los intentos anteriores se habían interrumpido antes de que Vitest imprimiera el resultado;
  la inspección local confirmó progreso entre suites y ausencia de deadlock.
- El editor incorpora una segunda vista basada en la página pública real, actualizada desde el borrador
  mediante mensajería limitada al mismo origen. Permite alternar escritorio/teléfono y conserva el modo
  borrador al navegar dentro de la vista. Una respuesta pública incompleta se descarta sin reemplazar el
  diseño seguro. Las pruebas focales de App/editor aprobaron 22 casos; el gate web completo aprobó 13
  archivos y 89 pruebas, junto con lint, tipos y compilación de producción.
- Catorce elementos visuales que ya forman parte de Portada, Tienda, Torneos, Noticias, Comunidad y
  Cómics se exponen ahora como elementos seleccionables. El administrador puede ajustar desplazamiento,
  ancho, profundidad y visibilidad móvil, o restablecer la posición original. El contrato conserva
  compatibilidad con versiones publicadas anteriores, impide trasladar elementos entre secciones y deja
  fuera del documento editable los botones de navegación, compra y formularios. Aprobaron 29 pruebas
  focales, 91 pruebas web completas, lint, tipos y compilación. La revisión local de Portada confirmó a
  390 px cero imágenes rotas, cero overflow horizontal y cero botones menores de 44 px.
- La biblioteca del editor dejó de limitarse a seis adornos: incorpora los 106 recursos sin texto del
  manifiesto aprobado, agrupados por tipo y presentados con miniaturas. Los PNG públicos conservan los
  bytes originales; la verificación comparó los 106 SHA-256 sin diferencias. El contrato admite 112
  identificadores cerrados —106 oficiales y seis alias heredados— para no invalidar apariencias ya
  publicadas. Un generador reproducible obtiene el catálogo desde el manifiesto y las pruebas comprueban
  tanto el conjunto cerrado como la selección visual por categoría. Aprobaron lint, compilación web,
  73 archivos/283 pruebas unitarias y 13 archivos/92 pruebas web.
- La operación fina del editor añade entrada numérica exacta junto a cada deslizador, alineación rápida
  izquierda/centro/derecha, envío al frente o fondo y duplicado con desplazamiento seguro. El límite de
  24 capas continúa aplicándose también al duplicar. El gate focal aprobó 13 pruebas del editor y la
  suite web completa aprobó 13 archivos/93 pruebas, además de lint, tipos y compilación.
- La QA visual local final de Portada cubrió 390, 768 y 1.280 px. En los tres tamaños el título quedó
  visible, no hubo imágenes rotas ni overflow horizontal; teléfono y tableta tampoco mostraron controles
  menores de 44 px. Los únicos controles de 40 px corresponden a la navegación compacta de escritorio.
- Tienda, Torneos, Noticias, Comunidad y Cómics se recorrieron localmente a 390 y 1.280 px. Las diez
  combinaciones renderizaron contenido principal, sin imágenes rotas ni overflow horizontal; a 390 px no
  hubo controles menores de 44 px. Como la API comercial no estaba activa durante esta revisión, el PASS
  es estructural y responsive: no certifica contenido remoto ni sus estados con datos reales.
- El gate acumulado posterior al editor y al catálogo visual aprobó lint, tipos, compilación API/web y
  115 archivos con 477 pruebas aprobadas más una omisión documentada: 283 unitarias, 45 de aplicación,
  56 de contrato y 93 web. La integración PostgreSQL completa volvió a aprobar 14 archivos/170 pruebas
  en 243,85 segundos con el contrato ampliado de apariencia.
- El conjunto acumulado se subió únicamente a `codex/staging-acceptance` en `a446552`; `main`, Producción
  y el dominio canónico no se modificaron. Vercel dejó `Ready` la Preview exacta
  `sergod-store-v4-3fjfbwges-sergod-store.vercel.app`. Portada, Tienda, Torneos, Noticias, Comunidad y
  Cómics se recorrieron allí a 390 y 1.280 px: las doce combinaciones mostraron su título y contenido,
  sin imágenes rotas ni desbordamiento horizontal; a 390 px tampoco hubo controles interactivos menores
  de 44 px. La Tienda no registró errores de consola durante la comprobación.
- Un recurso de la nueva biblioteca aprobada se comprobó directamente desde la Preview y conservó sus
  dimensiones originales de 450 × 151 px, confirmando que el catálogo está incluido en el artefacto
  desplegado. La alias de la rama protege `/admin/appearance`, pero no conserva una sesión Admin; por ello
  la inspección visual autenticada y el guardado remoto continúan pendientes. Además, la API productiva
  todavía ejecuta el contrato anterior: no debe intentarse publicar la nueva estructura hasta desplegar
  de forma coordinada la API y, después, aceptar la Preview con una sesión Admin real.
- La sesión Admin real se comprobó posteriormente en la alias de la rama. El editor se protegió
  correctamente y mantuvo deshabilitada la edición porque la API productiva aún responde `404` en
  `GET /api/v1/site-appearance`. También se encontró que la política propia de Vercel impedía la vista
  incrustada: la aplicación cambió `frame-ancestors` a `'self'` y `X-Frame-Options` a `SAMEORIGIN`, con
  prueba contractual, sin permitir framing externo. `99e5de9` quedó `Ready` en Preview; no obstante,
  Vercel Authentication intercepta las URLs protegidas con un `302` y `X-Frame-Options: DENY`, por lo
  que la vista real seguirá bloqueada exclusivamente en esas Previews mientras esa protección externa
  esté activa. Producción no se promovió.
- La alias `codex/staging-acceptance` se agregó de forma explícita a las excepciones de Deployment
  Protection: pasó a responder `200` sin redirección de Vercel y conservó CSP limitada a `'self'`. La
  página de vista previa cargó correctamente como navegación independiente. El iframe siguió rechazado
  dentro del navegador integrado de Codex incluso al retirar temporalmente `X-Frame-Options`; por ello se
  restauró `SAMEORIGIN` y no se debilitó la defensa contra clickjacking. Esta limitación del entorno de
  inspección no convierte en PASS el iframe: debe comprobarse en un navegador normal cuando la API nueva
  permita cargar el editor.

## Aceptación visual aislada — 2026-09-13

- Se creó una infraestructura temporal gratuita y completamente aislada para aceptar el conjunto visual:
  Supabase `sergod-store-staging-temporal`, Render `sergod-store-api-staging-temporal` y la Preview de
  `codex/staging-acceptance`. Las 23 migraciones, el bucket privado `catalog-assets`, la identidad Admin y
  el bootstrap inicial quedaron operativos sin copiar datos productivos. Salud de API, lectura pública de
  apariencia, login Admin y persistencia de sesión respondieron correctamente. Con la excepción limitada
  a esta rama, la página real también se renderizó dentro del editor sin debilitar el framing externo.
- La Preview se enruta únicamente a la API y Supabase temporales. El dominio canónico, `origin/main` y los
  tres recursos productivos finales permanecen sin cambios. Antes de promover se debe restaurar en
  `vercel.json` el destino productivo `https://sergod-store-api-v4.onrender.com`.
- Los commits `9529cfe` y `e7c73a1` corrigieron el espacio del editor en portátiles y teléfonos: el panel
  lateral se repliega antes de comprimir el trabajo, el lienzo y el inspector se apilan cuando corresponde,
  los controles visuales recuperan la jerarquía negro/rojo/cian y la portada móvil limita texto y acciones
  al ancho disponible. Aprobaron 96 pruebas web, tres comprobaciones de la biblioteca visual, tipos y dos
  compilaciones web. La Preview exacta sirvió el CSS actualizado y la API temporal continuó HTTP 200.
- La publicación remota del diseño base completó el ciclo `guardar → activar → recargar → leer` y el
  editor mostró `Apariencia publicada cargada` después de una nueva lectura. El endpoint público devolvió
  un layout versión 1 no nulo y Portada, Tienda, Torneos, Noticias, Comunidad y Cómics respondieron HTTP 200.
- Los commits `2305848` y `18994f9` cerraron los dos hallazgos responsive finales: el lienzo de apariencia
  dejó de imponer un ancho mínimo efectivo en teléfonos y el adorno del encabezado administrativo dejó de
  superponerse al título móvil. La revisión posterior a 390 y 1.280 px confirmó contenido principal visible,
  cero imágenes rotas y cero desbordamiento horizontal en las seis rutas públicas y en Apariencia, POS,
  Catálogo y Contenido. A 390 px tampoco quedaron controles interactivos menores de 44 px.
- El gate integral previo a promoción aprobó formato, lint, tipos, compilación API/web y 116 archivos de
  prueba: 478 pruebas aprobadas y una omisión documentada. La aceptación visual aislada y el gate local
  están cerrados.
- El respaldo productivo inmediato `sergod-production-public-20260913-144809.dump.aes` quedó cifrado y
  autenticado fuera de Git. Su restauración desechable reprodujo 82 tablas y 7.539 filas sin diferencias
  frente a Producción; SHA-256
  `161E1246F5C180E989792901FE021CFDF0D3B2A9CF28FD27D740FAA94C28C266`. Este respaldo cerró el prerrequisito
  inmediato para la promoción coordinada; los recursos temporales pueden retirarse únicamente después de
  conservar esta evidencia y confirmar sus destinos exactos.

## Promoción visual productiva — 2026-09-13

- `main` avanzó de forma directa, sin reescribir historia, desde `0042a32` hasta el checkpoint recuperable
  `c1ccd5a`. Vercel dejó ese commit `Ready` en el dominio canónico y Render lo dejó `Live` en
  `sergod-store-api-v4`; la web conserva rewrites y CSP dirigidos únicamente a la API productiva.
- `GET /health` respondió HTTP 200 tanto en la API como mediante `www.sergodstore.cl`. La migración
  prospectiva de apariencia quedó disponible y `GET /api/v1/site-appearance` respondió HTTP 200. Producción
  aún no contiene una personalización publicada, por lo que la web usa deliberadamente el diseño base final
  y Admin permite crear su primera versión sin copiar datos de staging.
- Portada, Tienda, Torneos, Noticias, Comunidad y Cómics, junto con Login, Registro, Apariencia, POS,
  Catálogo y Contenido, respondieron HTTP 200. La sesión Admin sobrevivió la promoción y Apariencia cargó
  el editor por capas con su vista real incrustada.
- La revisión final del dominio canónico a 390 y 1.280 px confirmó contenido principal visible, cero
  imágenes rotas y cero desbordamiento horizontal en las seis rutas públicas. A 390 px no hubo controles
  interactivos menores de 44 px. Apariencia, POS, Catálogo y Contenido también cargaron sin imágenes rotas
  ni desbordamiento en móvil; la revisión de Apariencia en escritorio volvió a cerrar esos mismos controles.
- El artefacto productivo sirvió `index-CkNuOU4b.js` e `index-yxcQij4i.css`, y mantuvo
  `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN` y conexión permitida únicamente a Supabase y a
  `sergod-store-api-v4.onrender.com`. El rollback inmediato de código es `0042a32` y el respaldo cifrado
  previo continúa disponible fuera de Git.
- La limpieza posterior eliminó Supabase temporal `gadfbiuzssrftpvjycor`, Render temporal
  `srv-daj9ebtg1s2s739t15t0` y las ramas remotas `codex/staging-acceptance` y
  `codex/final-visual-system`. Vercel conserva únicamente las variables Supabase de Producción, retiró la
  excepción pública de la alias temporal y muestra `No Active Branches`; sus despliegues anteriores quedan
  solo como historial protegido por la retención del proveedor, no como proyectos ni versiones activas.
  Permanecen exclusivamente `main`, Supabase PROD `kbhbaackrgwgvxxqdlwx`, Render PROD
  `srv-da3ij5flk1mc7380htcg`, Vercel `sergod-store-v4` y el dominio canónico.

## Reparación local de Apariencia — 2026-09-14

- La inspección posterior a la promoción detectó un `FAIL` real: Producción conservaba una versión
  anterior de `system_configurations_registered_value_ck` que rechazaba
  `WEB_APPEARANCE_LAYOUT`. Por eso el editor podía informar un fallo de validación y la lectura pública
  continuaba con `layout: null`. La migración prospectiva `024_web_appearance_constraint_repair`
  vuelve a declarar el registro completo sin alterar versiones ni historial existentes. La cadena de
  migraciones de aplicación y Supabase comparte el mismo SQL y tiene prueba contractual.
- Apariencia ahora abre con la vista previa real como área principal, mantiene biblioteca, capas e inspector
  disponibles sin recorridos verticales largos y permite buscar y añadir directamente los 120 recursos
  cerrados. Los accesos principales conservan nombre y ruta como propiedades funcionales protegidas: cambiar
  su arte no puede cambiar el destino ni eliminar su nombre accesible.
- Los ocho accesos —Tienda, Preventas, Torneos, Noticias, Comunidad, Loyalty, Quests y Cómics— usan las
  ilustraciones rotuladas aprobadas expresamente por el propietario. Sus fuentes canónicas, derivados WebP,
  manifiesto y script reproducible quedaron bajo `design/source-existing/home-launcher/`,
  `design/approved/home-launcher/`, `design/manifest/` y `scripts/codex/`; la web sirve solo los derivados
  optimizados. Las rutas fijas son `/shop`, `/shop`, `/tournaments`, `/news`, `/community`, `/account`,
  `/tournaments` y `/comics`, respectivamente.
- El respaldo 4× de `sheet_03` se conserva en `design/elementos-pagina1-hq-4x/` con 58 hashes
  verificados. Es material fuente: no se publica completo ni se usan sus rótulos horneados, evitando
  aproximadamente 15 MB innecesarios en el sitio y respetando la biblioteca aprobada.
- El gate local final de `0d6b159` aprobó formato, lint, tipos, compilación API/web y 116 archivos de prueba:
  484 casos aprobados y una omisión documentada; el gate web focal aprobó 97 casos. La Preview remota
  `sergod-store-v4-ecsb4vrkw-sergod-store.vercel.app` mostró los accesos ilustrados sin imágenes rotas ni
  recorte móvil, y la prueba navegó los ocho botones hasta sus ocho rutas fijas esperadas.
- Una reconstrucción posterior de ese mismo commit, `sergod-store-v4-lxj04rci7-sergod-store.vercel.app`,
  quedó `Ready` con las variables públicas de Supabase limitadas a `codex/appearance-gallery-repair`. La API
  oficial validó la identidad Admin, pero la comprobación del editor autenticado por esa URL quedó bloqueada
  por la protección de despliegues de Vercel: el acceso `/api/*` de la Preview devuelve la página de protección
  en vez del contrato JSON. No se publicó una configuración de prueba en Producción ni se aplicó la migración.
  Para cerrar la aceptación remota se requiere una excepción temporal limitada a esa Preview o una promoción
  coordinada posterior a aplicar la migración 024.
- La migración 024 y el rediseño permanecen en `codex/appearance-gallery-repair`; no están promovidos al dominio
  canónico. Los dos valores públicos añadidos solo para la rama y cualquier excepción temporal deben retirarse
  una vez completada la aceptación.
  Además, 8 pruebas PostgreSQL focales de configuración y persistencia aprobaron.
  Dos intentos de la integración completa quedaron bloqueados sin resultado después de una interrupción;
  no se cuentan como PASS. El cambio permanece aislado en su rama y requiere aplicación de la migración 024
  en la base productiva y aceptación remota del ciclo publicar → recargar antes de promoción.

## `DEFERRED_EXTERNAL` — no son PASS

No quedan comprobaciones externas diferidas por falta de credenciales. La creación y aceptación
personal de cuentas CLIENTE, junto con la carga del catálogo y del contenido real desde Admin, son
operaciones del propietario, no carencias técnicas ni fixtures de aceptación que deban publicarse.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
