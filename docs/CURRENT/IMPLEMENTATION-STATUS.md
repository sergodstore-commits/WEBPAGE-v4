# Implementation Status — CODEX-READY V4

> Estado auditado el 2026-08-24. Es evidencia de código, PostgreSQL local real y gates reproducidos; no es aceptación de proveedores oficiales, staging ni producción. Se declara `LOCAL_IMPLEMENTATION_COMPLETE` únicamente para el alcance local verificable descrito aquí.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                            | Pendiente separado                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Verificado localmente          | Unit/application/contract + PostgreSQL 18.4                                          | Staging y E2E remoto                                 |
| Orders + Checkout                                                                           | Corregido y probado            | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas en PostgreSQL   | E2E remoto                                           |
| Promotions + Loyalty en Order                                                               | Corregido y probado            | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL     | Carga y observabilidad en staging                    |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio           | E2E en staging                                       |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests focalizados                  | Proveedores oficiales y E2E                          |
| Flow                                                                                        | Adapter y rutas coherentes     | Firma, status, callback y retorno `/api/v1/payments/flow/return` probados localmente | Sandbox con credenciales                             |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status, retorno anormal y replay probados localmente                   | Ambiente Integración con credenciales                |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                | E2E en staging                                       |
| Cuenta cliente                                                                              | Superficie real completa V1    | Perfil, pedidos, preventas, puntos, preferencias, seguridad y barrera de sesión      | E2E autenticado remoto                               |
| Admin                                                                                       | Superficie real completa V1    | Operaciones enlazadas a APIs; barrera de rol previa al montaje; acciones auditables  | Matriz por rol en staging                            |
| Comercio público                                                                            | Corregido y ampliado           | Shell responsive, catálogo, carrito, checkout protegido y pago; deep links estables  | Catálogo/contenido real y E2E navegador remoto       |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos     | Operación y contenido real                           |
| Diseño y accesibilidad                                                                      | Verificado localmente          | Sistema visual aprobado; logo inmutable; QA escritorio/móvil, estados y controles    | Regresión visual en entorno remoto                   |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease acotado, idempotencia de proveedor, worker y wiring probados           | Envío real Resend y activación controlada del worker |
| Despliegue API                                                                              | Destino técnico disponible     | Render responde `/health`; Supabase está configurado                                 | E2E remoto, observabilidad y aceptación de operación |
| Despliegue web                                                                              | Dominio público V4 desfasado   | Vercel sirve una versión V4, pero sus bundles no corresponden al HEAD auditado       | Desplegar HEAD, aceptar preview y luego promover     |
| Aceptación externa final                                                                    | Explícitamente no ejecutada    | Script de reporte devuelve `DEFERRED_EXTERNAL` y no muta estado                      | Procedimientos y accesos reales                      |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- Runner oficial `scripts/codex/verify-local.ps1 -RunLocalIntegration`: `LOCAL_VERIFICATION=PASS` y salida natural `0` el 2026-08-23.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 63 archivos / 223 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 19 archivos / 53 PASS y 1 SKIP documentado.
- Web: 11 archivos / 42 pruebas PASS. Incluye rutas protegidas, restauración, persistencia, renovación/reintento acotado, sincronización de cierre de sesión y estado 404 explícito.
- Integration local: 13 archivos / 164 pruebas PASS sobre PostgreSQL 18.4. `test:integration:local` terminó naturalmente con código 0 el 2026-08-23.
- `codex:prepare`: 139 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`021` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- QA manual local: Inicio, Tienda, Editorial, Carrito, Checkout, Cuenta y accesos Admin revisados en escritorio/móvil; sin overflow horizontal y con acciones móviles de al menos 44 px.
- Invariantes focales: `FREIGHT_COLLECT` conserva costo `0`, no requiere domicilio y queda fuera del total; torneos siguen siendo contenido editorial sin motor competitivo.

## `DEFERRED_EXTERNAL` — no son PASS

- Flow sandbox y Webpay Integración.
- Envío real de email mediante Resend y activación del worker de notificaciones.
- Flow/Webpay con credenciales oficiales suficientes para aceptación.
- Sesión autenticada real en navegador remoto, incluyendo recarga y renovación de token.
- Vercel conectado a Git, E2E remoto, promoción, cambio de dominio, observabilidad, backup/restore y rollback.
- El dominio público usa bundles anteriores al HEAD: `/cart` y rutas desconocidas caen en Inicio, y Cuenta/Admin no incorporan todavía las barreras de montaje del build local actual.
- El catálogo remoto conserva fixtures de integración visibles y al menos un texto con codificación dañada; requieren limpieza remota trazable, no edición manual sin acceso administrado.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
