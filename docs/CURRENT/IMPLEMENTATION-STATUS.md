# Implementation Status — CODEX-READY V3

> Estado auditado el 2026-08-20. Es evidencia de código y gates locales, no aceptación de PostgreSQL real, proveedores, staging ni producción. No se declara `LOCAL_IMPLEMENTATION_COMPLETE`.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                            | Pendiente separado                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Base preservada y gates verdes | Unit/application/contract                                                            | PostgreSQL real y E2E remoto                           |
| Orders + Checkout                                                                           | Corregido                      | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas                 | Integración PostgreSQL real                            |
| Promotions + Loyalty en Order                                                               | Corregido                      | Consumo transaccional/idempotente desde snapshots; reserva loyalty prospectiva       | Concurrencia en PostgreSQL real                        |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio           | E2E en staging                                         |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests de repositorio               | Integración DB real                                    |
| Flow                                                                                        | Adapter y rutas coherentes     | Firma, status, callback y retorno `/api/v1/payments/flow/return` probados localmente | Sandbox con credenciales                               |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status y tests focalizados                                             | Ambiente Integración con credenciales                  |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                | Integración DB + E2E                                   |
| Cuenta cliente                                                                              | Superficie real acotada        | Perfil, pedidos y preferencias de despacho con repo/API                              | UX autenticada remota; otras áreas no se sobredeclaran |
| Admin                                                                                       | Superficie real acotada        | Operaciones enlazadas a APIs; se retiró la lista decorativa de módulos               | Matriz por rol en staging                              |
| Comercio público                                                                            | Corregido                      | Catálogo y botón Agregar al carrito con creación/reintento de carrito anónimo        | E2E navegador remoto                                   |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos     | Operación y contenido real                             |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease, polling, reintentos, Resend adapter, main y job one-shot; tests       | Dominio remitente y credenciales reales                |
| Aceptación externa final                                                                    | Explícitamente no ejecutada    | Script de reporte devuelve `DEFERRED_EXTERNAL` y no muta estado                      | Procedimientos y accesos reales                        |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 58 archivos / 211 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 17 archivos / 50 PASS y 1 SKIP documentado.
- Web: 7 archivos / 18 pruebas PASS.
- `codex:prepare`: 138 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`019` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- `test:integration:local`: `DEFERRED_EXTERNAL` en una sola detección porque no hay PostgreSQL configurado; no se iniciaron suites.

## `DEFERRED_EXTERNAL` — no son PASS

- PostgreSQL real e integración local.
- Flow sandbox y Webpay Integración.
- Envío real de email mediante dominio verificado.
- Staging/producción, E2E remoto, observabilidad, backup/restore y rollback.

Los hallazgos locales enumerados por la auditoría independiente que originó V3 fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
