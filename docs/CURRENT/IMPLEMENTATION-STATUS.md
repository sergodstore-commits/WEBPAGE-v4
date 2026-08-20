# Implementation Status — CODEX-READY V4

> Estado auditado el 2026-08-20. Es evidencia de código, PostgreSQL local real y gates reproducidos; no es aceptación de proveedores oficiales, staging ni producción. No se declara `LOCAL_IMPLEMENTATION_COMPLETE`.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                            | Pendiente separado                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Verificado localmente          | Unit/application/contract + PostgreSQL 18.4                                          | Staging y E2E remoto                                   |
| Orders + Checkout                                                                           | Corregido y probado            | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas en PostgreSQL   | E2E remoto                                             |
| Promotions + Loyalty en Order                                                               | Corregido y probado            | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL     | Carga y observabilidad en staging                      |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio           | E2E en staging                                         |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests focalizados                  | Proveedores oficiales y E2E                            |
| Flow                                                                                        | Adapter y rutas coherentes     | Firma, status, callback y retorno `/api/v1/payments/flow/return` probados localmente | Sandbox con credenciales                               |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status, retorno anormal y replay probados localmente                   | Ambiente Integración con credenciales                  |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                | E2E en staging                                         |
| Cuenta cliente                                                                              | Superficie real acotada        | Perfil, pedidos y preferencias de despacho con repo/API                              | UX autenticada remota; otras áreas no se sobredeclaran |
| Admin                                                                                       | Superficie real acotada        | Operaciones enlazadas a APIs; se retiró la lista decorativa de módulos               | Matriz por rol en staging                              |
| Comercio público                                                                            | Corregido                      | Catálogo y botón Agregar al carrito con creación/reintento de carrito anónimo        | E2E navegador remoto                                   |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos     | Operación y contenido real                             |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease acotado, idempotencia de proveedor, worker y wiring probados           | Dominio remitente y credenciales reales                |
| Aceptación externa final                                                                    | Explícitamente no ejecutada    | Script de reporte devuelve `DEFERRED_EXTERNAL` y no muta estado                      | Procedimientos y accesos reales                        |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 59 archivos / 216 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 19 archivos / 53 PASS y 1 SKIP documentado.
- Web: 7 archivos / 19 pruebas PASS.
- Integration local: 12 archivos / 163 pruebas PASS sobre PostgreSQL 18.4; upgrade `020`→`021` y fresh install `001`→`021` reproducidos.
- `codex:prepare`: 138 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`021` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- `test:integration:local`: PASS; el preflight único y la base portátil real fueron utilizados.

## `DEFERRED_EXTERNAL` — no son PASS

- Flow sandbox y Webpay Integración.
- Envío real de email mediante dominio verificado.
- Supabase/staging/producción, E2E remoto, observabilidad, backup/restore y rollback.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
