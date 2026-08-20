# Implementation Status — CODEX-READY V4

> Estado auditado el 2026-08-20. Es evidencia de código, PostgreSQL local real y gates reproducidos; no es aceptación de proveedores oficiales, staging ni producción. No se declara `LOCAL_IMPLEMENTATION_COMPLETE`.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                            | Pendiente separado                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Verificado localmente          | Unit/application/contract + PostgreSQL 18.4                                          | Staging y E2E remoto                                    |
| Orders + Checkout                                                                           | Corregido y probado            | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas en PostgreSQL   | E2E remoto                                              |
| Promotions + Loyalty en Order                                                               | Corregido y probado            | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL     | Carga y observabilidad en staging                       |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio           | E2E en staging                                          |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests focalizados                  | Proveedores oficiales y E2E                             |
| Flow                                                                                        | Adapter y rutas coherentes     | Firma, status, callback y retorno `/api/v1/payments/flow/return` probados localmente | Sandbox con credenciales                                |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status, retorno anormal y replay probados localmente                   | Ambiente Integración con credenciales                   |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                | E2E en staging                                          |
| Cuenta cliente                                                                              | Superficie real acotada        | Perfil, pedidos, preferencias y sesión web persistente con renovación Supabase       | E2E autenticado remoto; otras áreas no se sobredeclaran |
| Admin                                                                                       | Superficie real acotada        | Operaciones enlazadas a APIs; se retiró la lista decorativa de módulos               | Matriz por rol en staging                               |
| Comercio público                                                                            | Corregido y ampliado           | Shell responsive, catálogo, carrito, checkout y pago; deep links preservados         | Catálogo/contenido real y E2E navegador remoto          |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos     | Operación y contenido real                              |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease acotado, idempotencia de proveedor, worker y wiring probados           | Envío real Resend y activación controlada del worker    |
| Despliegue API                                                                              | Destino técnico disponible     | Render responde `/health`; Supabase está configurado                                 | E2E remoto, observabilidad y aceptación de operación    |
| Despliegue web                                                                              | Preview V4 separado disponible | Proyecto Vercel V4 y preview del commit con deep links corregidos                    | Conexión Git, promoción y cambio de dominio             |
| Aceptación externa final                                                                    | Explícitamente no ejecutada    | Script de reporte devuelve `DEFERRED_EXTERNAL` y no muta estado                      | Procedimientos y accesos reales                         |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 59 archivos / 216 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 19 archivos / 53 PASS y 1 SKIP documentado.
- Web: 9 archivos / 27 pruebas PASS. Incluye restauración tras recarga, persistencia, renovación/reintento acotado y sincronización de cierre de sesión.
- Integration local: 12 archivos / 163 aserciones PASS sobre PostgreSQL 18.4; en la repetición final el proceso no salió después del resumen PASS y requirió terminación manual. El runner debe diagnosticarse antes de declarar el gate completamente verde.
- `codex:prepare`: 138 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`021` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- `test:integration:local`: PASS; el preflight único y la base portátil real fueron utilizados.

## `DEFERRED_EXTERNAL` — no son PASS

- Flow sandbox y Webpay Integración.
- Envío real de email mediante Resend y activación del worker de notificaciones.
- Flow/Webpay con credenciales oficiales suficientes para aceptación.
- Sesión autenticada real en navegador remoto, incluyendo recarga y renovación de token.
- Vercel conectado a Git, E2E remoto, promoción, cambio de dominio, observabilidad, backup/restore y rollback.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.

## Advertencia local conocida al handoff

- `test:integration:local` detecta PostgreSQL ausente una sola vez correctamente. Con PostgreSQL activo, las 12 suites y 163 pruebas terminaron PASS, pero la última ejecución no cerró el proceso después de imprimir el resumen. Se terminó manualmente. Esto no invalida las aserciones, pero impide llamar PASS limpio al comando completo hasta diagnosticar el handle/proceso pendiente.
