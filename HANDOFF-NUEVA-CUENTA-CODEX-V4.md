# Handoff verificable para una nueva cuenta de Codex

Fecha de corte: 2026-08-20.

Este repositorio es un checkpoint autocontenido de continuación. No representa una tienda terminada ni una promoción a producción. `docs/CURRENT/` sigue siendo la autoridad del producto y `.codex-mission/STATE.json` conserva la misión activa desde `00-baseline` para que la nueva cuenta audite antes de avanzar.

## Qué está listo localmente

- Backend de Foundation, Identity, Catalog, Inventory, Promotions, Loyalty, Preorders, Cart, Orders, Payments, Fulfillment, Editorial y Notifications implementado y cubierto por pruebas.
- Orders de total cero confirman `PAID` sin `PaymentAttempt` externo.
- Promociones y loyalty se reservan/consumen/liberan idempotentemente según CURRENT.
- Flow y Webpay tienen adapters, callbacks/retornos y pruebas locales focalizadas. No existe POS físico Transbank.
- Fulfillment mantiene `fulfillment_events` y `order_state_history`.
- Notifications tiene outbox, worker, leases, idempotencia y wiring ejecutable.
- Web responsive con navegación pública, catálogo, carrito persistente, checkout, selección Flow/Webpay y superficies acotadas de Cuenta/Admin.
- La sesión web se restaura tras recargar y Supabase renueva el access token; existen pruebas de persistencia, retry único y cierre entre pestañas.
- `FREIGHT_COLLECT` no exige domicilio y usa `shippingCostAmountClp=0`; torneos son solo editoriales.
- Las 31 migraciones históricas protegidas permanecen intactas; las migraciones V4 son únicamente prospectivas.

## Estado externo observado, sin secretos

- GitHub: `https://github.com/sergodstore-commits/WEBPAGE-v4.git`, rama `main`. La copia entregada no conserva remotes.
- API Render: `https://sergod-api-6f8c2a91-2026.onrender.com`; el plan gratuito puede dormir. Verificar `/health` de nuevo.
- Supabase correcto: proyecto `skhsmsgmceldmapdvcqo`, URL `https://skhsmsgmceldmapdvcqo.supabase.co`, región `ca-central-1`.
- Resend: dominio `sergodstore.cl` verificado en São Paulo. El worker permanece desactivado hasta probar un envío real.
- Vercel: el dominio `sergodstore.cl` sigue conectado al proyecto antiguo. Existe un proyecto V4 separado (`sergod-store-v4`) y un preview del commit `f3e094a`, pero no está conectado a Git ni promovido al dominio.
- Flow: el propietario informó disponer de una API, pero no se verificó que estén todas las credenciales de sandbox requeridas.
- Webpay: credenciales/aceptación de Integración pendientes.

Los secretos permanecen fuera de Git y fuera del paquete. Nunca imprimirlos, copiarlos a documentación ni subir un `.env`, aunque el repositorio sea privado.

## Trabajo que todavía falta

1. Auditar este paquete y reproducir gates; cualquier fallo nuevo es `FAIL`, no `DEFERRED_EXTERNAL`.
2. Diagnosticar por qué `test:integration:local` no cerró después de que las 163 pruebas terminaran PASS; reproducir salida limpia antes de llamar verde al gate completo.
3. Completar las interfaces Admin que aún no cubren catálogo, inventario, preventas, promociones, loyalty, configuración y auditoría.
4. Cargar catálogo/contenido reales y reemplazar la URL legal de ejemplo.
5. Ejecutar aceptación oficial Flow sandbox y Webpay Integración con credenciales reales.
6. Ejecutar un envío real Resend, comprobar recepción y solo entonces activar el worker de notificaciones.
7. Conectar el proyecto Vercel V4 al repositorio/commit correcto, validar variables sin exponerlas y ejecutar E2E remoto contra API/Supabase.
8. Verificar observabilidad, backup/restore y rollback; recién después promover el V4 y mover `sergodstore.cl`.
9. Retirar fixtures solo mediante un plan explícito, revisado y autorizado. Preservar cuentas, sucursal, configuración y cualquier dato real.

## Datos conocidos que no deben sobredeclararse

- El catálogo remoto observado contiene fixtures, no el catálogo final del negocio.
- La UI Admin es operativa pero incompleta para todas las capacidades del backend.
- No se ha completado una compra real Flow/Webpay ni una notificación real de extremo a extremo.
- La persistencia/renovación de sesión está probada localmente, pero aún debe validarse con un login real remoto después de configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en Vercel.
- No se ejecutó la limpieza irreversible propuesta para tablas remotas.
- La repetición final de integración imprimió 163 PASS, pero quedó colgada al salir y se terminó manualmente.
- `LOCAL_IMPLEMENTATION_COMPLETE`, producción lista y aceptación externa siguen sin declararse.

## Inicio recomendado

1. Leer `INICIO-NUEVA-CUENTA-CODEX-V4.txt`, `AGENTS.md`, `docs/CURRENT/` y el stage actual.
2. Verificar SHA-256 del ZIP y los manifiestos externos.
3. Confirmar Git limpio, sin remotes, y ejecutar `git fsck --full`.
4. Ejecutar `npm ci`, `npm run codex:prepare`, `npm run verify`, `npm run test:integration:local`, `npm audit` y `npm run delivery:audit` según disponibilidad local.
5. Comparar resultados con `DELIVERY-VERIFICATION.json`; actualizar evidencia, no acomodar resultados.
