# Implementation Status — CODEX-READY V4

> Estado auditado hasta el 2026-08-27. Es evidencia de código, PostgreSQL local real y gates reproducidos; no es aceptación de proveedores oficiales, staging ni producción. Se declara `LOCAL_IMPLEMENTATION_COMPLETE` únicamente para el alcance local verificable descrito aquí.

| Área                                                                                        | Estado local verificable       | Evidencia                                                                               | Pendiente separado                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart y Pseudo-POS | Verificado localmente          | Unit/application/contract + PostgreSQL 18.4                                             | Staging y E2E remoto                                   |
| Orders + Checkout                                                                           | Corregido y probado            | Total cero confirma `PAID` sin `PaymentAttempt`; historial; reservas en PostgreSQL      | E2E remoto                                             |
| Promotions + Loyalty en Order                                                               | Corregido y probado            | Reserva/consumo/liberación idempotentes; límite global concurrente en PostgreSQL        | Carga y observabilidad en staging                      |
| `FREIGHT_COLLECT`                                                                           | Contrato unificado             | `shippingCostAmountClp=0`, no incluido en total, sin domicilio obligatorio              | E2E en staging                                         |
| Payments Core                                                                               | Implementado                   | Intentos, eventos, idempotencia, reconciliación y tests focalizados                     | Proveedores oficiales y E2E                            |
| Flow                                                                                        | Adapter y rutas coherentes     | Firma, status, callback y retorno `/api/v1/payments/flow/return` probados localmente    | Sandbox con credenciales                               |
| Webpay Plus                                                                                 | Adapter online; sin POS físico | Create/commit/status, retorno anormal y replay probados localmente                      | Ambiente Integración con credenciales                  |
| Fulfillment                                                                                 | Corregido                      | Cada transición mantiene `fulfillment_events` y `order_state_history`                   | E2E en staging                                         |
| Cuenta cliente                                                                              | Operativa en preview           | Perfil, pedidos, preventas, puntos, preferencias y seguridad renderizan con sesión real | Mutaciones E2E y renovación controlada del token       |
| Admin                                                                                       | Datos operativos en preview    | 10 rutas, estados traducidos, referencias acotadas y resultados sin JSON crudo          | Sustituir entradas manuales de códigos y completar E2E |
| Comercio público                                                                            | Corregido y ampliado           | Shell responsive, catálogo, carrito, checkout protegido y pago; deep links estables     | Catálogo/contenido real y E2E navegador remoto         |
| Editorial                                                                                   | Implementado                   | Repo/API y transición publish/archive/draft corregida; torneos solo informativos        | Operación y contenido real                             |
| Diseño y accesibilidad                                                                      | Verificado localmente          | Sistema visual aprobado; logo inmutable; QA escritorio/móvil, estados y controles       | Regresión visual en entorno remoto                     |
| Notificaciones                                                                              | Pipeline local ejecutable      | Outbox, lease acotado, idempotencia de proveedor, worker y wiring probados              | Envío real Resend y activación controlada del worker   |
| Despliegue API                                                                              | Staging operativo              | Render sirve `664f24c`; `/health` y catálogo responden 200; rollback verificado         | E2E funcional, observabilidad sostenida y promoción    |
| Despliegue web                                                                              | Preview de staging operativo   | Vercel sirve la rama auditada; sesión real, recarga y rutas protegidas verificadas      | E2E funcional, promoción y dominio                     |
| Aceptación externa final                                                                    | En ejecución                   | Sesión, limpieza remota, backup/restore y rollback ya tienen evidencia externa          | Proveedores, email, E2E restante y observabilidad      |

## Gates locales reproducidos

- Node `24.18.1` y npm `11.16.0`: compatibles con engines; lockfile preservado.
- `npm ci`: PASS.
- Runner oficial `scripts/codex/verify-local.ps1 -RunLocalIntegration`: `LOCAL_VERIFICATION=PASS` y salida natural `0` el 2026-08-23.
- `format:check`, `lint`, `typecheck`, `build`: PASS.
- Unit: 63 archivos / 223 pruebas PASS.
- Application: 8 archivos / 43 pruebas PASS.
- Contract: 19 archivos / 53 PASS y 1 SKIP documentado.
- Web: 11 archivos / 46 pruebas PASS. Incluye rutas protegidas, restauración, persistencia, renovación/reintento acotado, sincronización de cierre de sesión, estado 404 explícito y presentación operativa de Admin.
- Integration local: 13 archivos / 164 pruebas PASS sobre PostgreSQL 18.4. `test:integration:local` terminó naturalmente con código 0 el 2026-08-23.
- `codex:prepare`: 139 checks PASS; 8 Skills locales válidas.
- Migraciones protegidas: 31 intactas; `016`–`021` y mirrors Supabase son prospectivas.
- `npm audit`: 0 vulnerabilidades.
- Auditoría de entrega: sin archivos/directorios vacíos, `.env` reales ni placeholders bloqueantes.
- QA manual local: Inicio, Tienda, Editorial, Carrito, Checkout, Cuenta y accesos Admin revisados en escritorio/móvil; sin overflow horizontal y con acciones móviles de al menos 44 px.
- Invariantes focales: `FREIGHT_COLLECT` conserva costo `0`, no requiere domicilio y queda fuera del total; torneos siguen siendo contenido editorial sin motor competitivo.

## Evidencia externa de staging — 2026-08-24 a 2026-08-26

- Render `srv-da3ij5flk1mc7380htcg` sirve el commit auditado `664f24c02b881672a8ebe196066749996f3b4d03` desde `codex/staging-acceptance`; branch, health check `/health` y Auto-Deploy `On Commit` fueron reconfirmados.
- Smoke posterior al rollback: `GET /health` y `GET /api/v1/catalog/products?limit=1` respondieron HTTP 200.
- Rollback de código reproducible: `664f24c` → `eb9f084` (`dep-da61q53m8hqs73e9k8h0`) → `664f24c` (`dep-da61qvbncjis73aeu8ig`), con ambos despliegues `live` y smoke HTTP 200. El procedimiento aceptado es `Deploy a specific commit` seguido de restaurar Auto-Deploy; el rollback nativo se descartó porque no conservaba con certeza la configuración vigente.
- Backup lógico de staging verificado mediante restauración desechable: archivo custom de 566.935 bytes, 875 entradas y SHA-256 `065BA71CE3DBADA4B68730A500D484A423B3A1F021533516D01F15154FFD5434`; 22 migraciones, 80 tablas, 80 con RLS, 0 grants públicos y comparación exacta de 673 filas sin diferencias. Los artefactos temporales fueron eliminados.
- Preview Vercel de `codex/staging-acceptance` sirve el build auditado; se verificó sesión Supabase real, persistencia tras recarga y acceso protegido. Producción y dominio permanecen sin promover.
- El commit `87cf5f5` corrigió el contrato de loyalty en Cuenta y añadió recuperación por ruta. La preview volvió a renderizar `/account/overview` con perfil, pedidos, preventas, puntos y preferencias, sin errores de consola.
- El propietario aprobó 106 recursos UI sin texto el 2026-08-25. Se incorporaron con sus bytes originales a `design/approved/ui/` y quedaron registrados por SHA-256 en `design/manifest/APPROVED-UI-ASSETS.json`; 50 variantes con texto horneado permanecen excluidas.
- El commit `2fdc669` reorganizó Administración con una barra lateral fija en escritorio y menú desplegable en móvil. La preview verificó 20 accesos, ancho lateral de 272 px, cero overflow, cero controles menores de 44 px y cero errores de consola; esta estructura sirvió de base para separar las rutas.
- Los commits `aaa7286` y `ec57660` separaron Administración en 10 rutas centrales con consultas acotadas y un único editor pertinente por área. Se probaron todos los enlaces directos, el estado activo, la navegación interna, móvil a 359 px, cero overflow y cero errores de consola.
- Los commits `36550cd` y `05aaa4c` tradujeron estados y tipos únicamente en presentación, abreviaron referencias internas, reemplazaron JSON crudo en Cobertura/POS y repararon las palabras heredadas verificadas con mojibake. La preview confirmó cero estados internos visibles en Catálogo, cero bloques `pre`, cero caracteres `�` y cero overflow; Cobertura y POS mostraron resultados operativos. En móvil a 359 px no hubo overflow ni controles menores de 44 px.
- Los fixtures técnicos visibles fueron despublicados de forma trazable: 3 productos, 1 campaña, 1 colección, 1 categoría y 1 juego. El catálogo público queda vacío hasta que el propietario cargue productos reales desde Admin.

## `DEFERRED_EXTERNAL` — no son PASS

- Flow sandbox y Webpay Integración.
- Envío real de email mediante Resend y activación del worker de notificaciones.
- Flow/Webpay con credenciales oficiales suficientes para aceptación.
- Renovación real del token de sesión bajo expiración controlada.
- E2E funcional remoto completo, promoción de Vercel, cambio de dominio y observabilidad sostenida.

Los hallazgos locales conocidos de V3 y los defectos adicionales expuestos por PostgreSQL real fueron corregidos y tienen pruebas focalizadas. Cualquier hallazgo nuevo debe registrarse como `FAIL`, no reinterpretarse como `DEFERRED_EXTERNAL`.
