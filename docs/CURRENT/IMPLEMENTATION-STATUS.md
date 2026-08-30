# Implementation Status — CODEX-READY V4

> Estado auditado hasta el 2026-08-29. Incluye evidencia local reproducible y aceptación externa parcial en staging, incluida Flow sandbox. Producción aún no está aceptada ni promovida.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                                | Pendiente separado                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Pseudo-POS aceptado en staging | Unit/application/contract + PostgreSQL 18.4; venta remota y stock restaurado             | E2E remoto restante fuera de Pseudo-POS              |
| Orders + Checkout                                                                           | Corregido y probado            | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas en PostgreSQL       | E2E remoto                                           |
| Promotions + Loyalty en Order                                                               | Corregido y probado            | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL         | Carga y observabilidad en staging                    |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio               | E2E en staging                                       |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests focalizados                      | Proveedores oficiales y E2E                          |
| Flow                                                                                        | Sandbox E2E PASS               | Pago real sandbox, verificación servidor-a-servidor, Order `PAID`, inventario y limpieza | Promoción a producción en RELEASE                    |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status, retorno anormal y replay probados localmente                       | Ambiente Integración con credenciales                |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                    | E2E en staging                                       |
| Cuenta cliente                                                                              | Aceptación remota base PASS    | Identidad verificada, perfil, pedidos, preventas, puntos y preferencias con sesión real  | Mutaciones E2E y renovación controlada del token     |
| Admin                                                                                       | Pseudo-POS aceptado en staging | 10 rutas, selectores operativos, CRUD de medios y venta presencial remota                | Completar E2E de las demás operaciones críticas      |
| Comercio público                                                                            | Corregido y ampliado           | Shell responsive, catálogo, carrito, checkout protegido y pago; deep links estables      | Catálogo/contenido real y E2E navegador remoto       |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos         | Operación y contenido real                           |
| Diseño y accesibilidad                                                                      | Verificado localmente          | Sistema visual aprobado; logo inmutable; QA escritorio/móvil, estados y controles        | Regresión visual en entorno remoto                   |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease acotado, idempotencia de proveedor, worker y wiring probados               | Envío real Resend y activación controlada del worker |
| Despliegue API                                                                              | Staging operativo              | Render sirve la rama auditada; `/health`, cuenta, Orders y Flow responden correctamente  | E2E restante, observabilidad sostenida y promoción   |
| Despliegue web                                                                              | Preview de staging operativo   | Vercel sirve la rama auditada; sesión real, recarga y rutas protegidas verificadas       | E2E funcional, promoción y dominio                   |
| Aceptación externa final                                                                    | En ejecución                   | Sesión, Flow, limpieza remota, backup/restore y rollback tienen evidencia externa        | Webpay, email, E2E restante y observabilidad         |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- Runner oficial `scripts/codex/verify-local.ps1 -RunLocalIntegration`: `LOCAL_VERIFICATION=PASS` y salida natural `0` el 2026-08-23.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 64 archivos / 226 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 19 archivos / 53 PASS y 1 SKIP documentado.
- Web: 11 archivos / 53 pruebas PASS. Incluye rutas protegidas, restauración, persistencia, renovación/reintento acotado, registro idempotente ante doble envío, sincronización de cierre de sesión, estado 404 explícito y presentación operativa de Admin.
- Integration local: 13 archivos / 164 pruebas PASS sobre PostgreSQL 18.4. `test:integration:local` terminó naturalmente con código 0 el 2026-08-23.
- `codex:prepare`: 135 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`021` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- QA manual local: Inicio, Tienda, Editorial, Carrito, Checkout, Cuenta y accesos Admin revisados en escritorio/móvil; sin overflow horizontal y con acciones móviles de al menos 44 px.
- Invariantes focales: `FREIGHT_COLLECT` conserva costo `0`, no requiere domicilio y queda fuera del total; torneos siguen siendo contenido editorial sin motor competitivo.

## Evidencia externa de staging — 2026-08-24 a 2026-08-29

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
- Los commits `149183d` y `bc354b0` reemplazaron en Pseudo-POS y Cobertura los identificadores editables por selectores alimentados con sucursales, productos, campañas, líneas de venta, cuentas y medios reales. Las pruebas focales verificaron que se conservan los identificadores exactos enviados a la API. La preview mostró la dirección y el medio de pago persistidos, cero campos editables de identificadores, cero errores de consola y cero overflow; a 359 px tampoco hubo controles menores de 44 px.
- El E2E remoto trazable `ACCEPT-E2E-MTCV00OP` creó, editó y eliminó un medio externo temporal desde Pseudo-POS. La limpieza se comprobó mediante la ausencia del identificador en los selectores y en la consulta actualizada de medios; no hubo errores de consola. Este PASS cubre ese CRUD administrativo, no sustituye los recorridos pendientes de venta, cuenta, pedidos o proveedores.
- Los commits `718dd77` y `a77b93a` corrigieron la selección de registros administrativos para priorizar el identificador propio ante relaciones como categoría, producto o promoción, y alinearon el juego con el `gameId` real del API. El runner restringido a staging completó `ACCEPT-POS-E2E-20260828145219`: publicó temporalmente la cadena técnica existente, registró una unidad, completó la venta regular con referencia auditable, verificó un único movimiento `POS_SALE_CONSUMED`, restauró stock/reservas a `0/0` y despublicó toda la cadena. El preflight posterior confirmó el estado restaurado.
- Se detectó que el `.env` local y el runner POS aún apuntaban al servicio Render antiguo `sergod-api-6f8c2a91-2026.onrender.com`, cuyo contrato rechazaba `orderType`. El destino se alineó con `sergod-store-api-v4.onrender.com`, ya usado por el rewrite de Vercel. En el servicio vigente, login devolvió sesión y `GET /api/v1/orders` para `REGULAR`/`PREORDER`, además de la variante Admin, respondieron HTTP 200; perfil, preferencias y loyalty también respondieron 200. El preflight POS volvió a pasar con stock/reservas `0/0`.
- Los fixtures técnicos visibles fueron despublicados de forma trazable: 3 productos, 1 campaña, 1 colección, 1 categoría y 1 juego. El catálogo público queda vacío hasta que el propietario cargue productos reales desde Admin.
- La identidad `CLIENTE` preparada por el propietario estaba confirmada en Supabase, pero la verificación interna seguía `PENDING`. Se reconcilió mediante el callback oficial de la aplicación, sin escritura SQL directa, y quedó `VERIFIED`, enlazada a una única cuenta `CLIENTE` activa y sin reconciliaciones abiertas.
- `scripts/codex/remote-client-account-acceptance.ps1` completó `CLIENT_ACCOUNT_ACCEPTANCE=PASS` contra `sergod-store-api-v4.onrender.com`: pedidos regulares `0`, preventas `0`, movimientos de loyalty `0` y lectura de preferencias PASS. El proveedor de identidad ahora distingue credenciales inválidas (`401`), correo pendiente (`409`) e indisponibilidad real (`503`), y el formulario conserva una clave idempotente para impedir dobles altas o mensajes engañosos por reenvío.
- Flow sandbox completó `ACCEPT-FLOW-E2E-20260830021449` para `SG-2026-000005`: `PAYMENT_STATUS=SUCCEEDED`, `ORDER_STATUS=PAID` y `REMOTE_FLOW_CLEANUP=PASS`. La aceptación verificó el estado directamente con Flow y luego contra la API/DB; el retorno del navegador no se usó como autoridad. Durante la prueba se corrigieron dos defectos reales de persistencia (`42702` por `version` ambiguo y monto numérico de Flow recibido como texto). El adaptador también envía `timeout` alineado con la expiración de la reserva para impedir pagos tardíos.

## `DEFERRED_EXTERNAL` — no son PASS

- Webpay Integración.
- Envío real de email mediante Resend y activación del worker de notificaciones.
- Webpay con credenciales oficiales suficientes para aceptación.
- Renovación real del token de sesión bajo expiración controlada.
- E2E funcional remoto completo, promoción de Vercel, cambio de dominio y observabilidad sostenida.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
