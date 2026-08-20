# Implementation Status — CODEX-READY V2

> Estado rebaselined el 2026-08-20. Es evidencia local, no aceptación de proveedores ni producción. CURRENT continúa siendo la autoridad y Codex debe auditar/corregir toda preimplementación.

| Área                                                                                       | Implementación local                             | Evidencia disponible                                              | Pendiente obligatorio                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------- |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart, Pseudo-POS | Preimplementado/avanzado                         | Gates unit/application/contract locales                           | Auditoría de conformidad y PostgreSQL real   |
| Orders + Checkout                                                                          | Implementado localmente                          | Dominio, API, migraciones prospectivas y pruebas                  | Integración con PostgreSQL real y E2E remoto |
| `FREIGHT_COLLECT`                                                                          | Implementado: shipping 0, domicilio no requerido | Pruebas locales de dominio/aplicación                             | E2E en staging                               |
| Payments Core                                                                              | Implementado agnóstico                           | Intentos, eventos, idempotencia, reconciliación y pruebas locales | Integración DB real                          |
| Flow                                                                                       | Adapter REST implementado                        | Firma/mapeo/callback + verificación server-to-server en código    | Sandbox real con credenciales                |
| Webpay Plus                                                                                | Adapter REST implementado; sin POS físico        | Create/commit/status y reconciliación en código                   | Ambiente Integración con credenciales        |
| Fulfillment                                                                                | Implementado                                     | Máquina de estados, tracking, eventos y notificaciones            | Integración DB + E2E remoto                  |
| Cuenta cliente                                                                             | Superficies implementadas                        | Cuenta/órdenes/preferencias/preorders/loyalty/security            | UX/E2E autenticado remoto                    |
| Admin                                                                                      | Superficies y APIs implementadas                 | Orders/payments/fulfillment/editorial y módulos                   | Matriz completa por rol en staging           |
| Comercio público                                                                           | Implementado                                     | Home, shop, búsqueda y consumo de API pública                     | E2E/visual remoto y contenido real           |
| Editorial                                                                                  | Implementado                                     | Torneos, noticias, comunidad y cómics como contenido editorial    | Operación real y revisión de contenido       |
| Diseño                                                                                     | Integración local implementada                   | Asset oficial preservado; UI responsive y accesible base          | QA visual en navegadores/dispositivos        |
| Notificaciones                                                                             | Outbox, worker y plantillas implementados        | Pruebas unitarias de reintento/plantillas                         | Adapter y envío con proveedor real           |
| Hardening                                                                                  | Base implementada                                | Headers, CORS, timeout, smoke y auditoría de entrega              | Pentest/observabilidad/staging reales        |

## Gates locales ejecutados en Work

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; el package manager preferido es npm `11.18.0`.
- `npm ci`: PASS, lockfile preservado.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 46 archivos / 185 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 16 archivos / 47 PASS y 1 SKIP documentado.
- Web: 6 archivos / 17 pruebas PASS.
- `codex:prepare`: PASS antes del rebaseline; debe repetirse sobre el estado final.
- Migraciones protegidas: 31 intactas; los cambios V2 son prospectivos (`017`, `018` y sus mirrors Supabase).

## `DEFERRED_EXTERNAL` — no son PASS

- PostgreSQL real/integration: el entorno no pudo descargar el runtime portable y no había servicio local disponible.
- Flow sandbox y Webpay Integración: faltan credenciales y ambiente de aceptación.
- Email real: faltan proveedor, dominio verificado y credenciales.
- Staging/producción, E2E remoto, observabilidad y rollback: no se proporcionaron destinos ni autorización.

La misión reducida en `.codex-mission/` obliga a Codex a empezar desde auditoría, corregir la base y reunir evidencia externa antes de Release.
