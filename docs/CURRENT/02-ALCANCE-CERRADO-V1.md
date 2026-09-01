# 02 — Alcance cerrado V1

## Regla principal

Sergod Store Web V1 contiene exclusivamente las capacidades definidas en `01-ARBOL-FUNCIONAL-V1.md` y desarrolladas por los demás documentos CURRENT. Una capacidad no enumerada no forma parte de V1.

## Núcleo comercial

- Catálogo TCG y recursos de imagen seguros.
- Inventario compartido como autoridad única de stock.
- Promociones automáticas, cupones y schedules semanales.
- Loyalty: acumulación, canje, configuración, movimientos y correcciones administrativas controladas.
- Carrito `REGULAR` / `PREORDER` / `CONFLICT`, merge y expiración.
- Checkout autenticado con revalidación de servidor.
- Orders con reserva temporal configurable cuando corresponda.
- Flow para pagos online. Por decisión expresa del propietario del 2026-09-01, Webpay Plus no
  forma parte de la operación productiva V1.
- Retiro en tienda y despacho por pagar a agencia de Chilexpress/Starken.
- Campañas de preventa con capacidad, disponibilidad, reserva/compromiso y cierre.
- Pseudo-POS para registrar ventas físicas y medios de pago recibidos.

## Experiencia y operación

- Sitio público: Inicio, Tienda, Torneos, Noticias, Comunidad y Cómics/Historias.
- Cuenta CLIENTE: perfil, preferencias de despacho, seguridad, pedidos, preventas y puntos.
- ADMIN: dashboard, catálogo, inventario, pedidos, preventas, promociones, loyalty, Pseudo-POS, contenido editorial, usuarios, configuración y auditoría.
- Contenido editorial administrado exclusivamente por ADMIN.
- Notificaciones transaccionales por email.

## Soporte técnico transversal

- DDD/Clean Architecture y límites de contexto.
- Auth y autorización ADMIN/CLIENTE.
- Auditoría e idempotencia.
- Outbox/Inbox y scheduled jobs cuando correspondan.
- RLS y grants restrictivos.
- Configuración versionada.
- Snapshots e historial necesarios para explicar operaciones persistidas.
- Locks/concurrencia y consistencia de inventario.
- Storage privado/controlado.
- Logging, observabilidad, backups y rollback.

## Criterio de implementación

No se amplía el producto por sugerencias de frameworks, Skills, paquetes, convenciones genéricas de ecommerce o preferencias del agente. Cada cambio debe poder señalar la capacidad CURRENT que satisface.
