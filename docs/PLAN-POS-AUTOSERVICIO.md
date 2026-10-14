# POS interno y futuro autoservicio SERGOD

Estado: propuesta revisada; el POS actual registra pagos recibidos por el administrador. Todavía no es una caja de autoservicio ni está integrado con Mercado Pago Point.

## Menú solicitado

| Artículo                | Precio CLP |
| ----------------------- | ---------: |
| Limón Soda              |      1.500 |
| Pap                     |      1.500 |
| Pepsi                   |      1.500 |
| Kem Piña                |      1.500 |
| Pepsi Zero              |      1.500 |
| Coca-Cola Zero          |      1.500 |
| Fanta                   |      1.500 |
| Sprite                  |      1.500 |
| Coca-Cola               |      1.500 |
| Cerveza                 |      1.500 |
| Completo                |      2.000 |
| Promo completo + bebida |      3.000 |

La promo ahorra $500 frente a comprar completo y bebida por separado. Decisiones confirmadas: la promo incluye solo bebidas sin alcohol y el menú tiene control de stock. El dueño cargará las cantidades manualmente desde el POS; todos los artículos parten en cero. No se deben inventar tamaños, marcas de cerveza ni stock.

## Estructura recomendada

1. Separar canal de venta en el servidor: web y local. Un artículo exclusivo del local debe quedar fuera del catálogo, búsqueda, ficha pública, recomendaciones, guías y checkout web, incluso si alguien envía su identificador directamente. No basta con esconderlo mediante CSS.
2. POS del personal con dos grupos claros: Cartas y productos / Menú del local. La promo necesita elegir una bebida y conservar esa elección en el ticket. Si hay control de stock, descuenta los componentes reales de la promo.
3. Pantalla de cliente separada del panel administrativo. Carrito grande, cantidades, resumen, precio final y botón de pagar. Nunca exponer sesión o permisos de administrador al cliente.
4. Elegir retiro ahora o entrega en una ronda válida del evento. Pedir mesa o identificador del pedido para entregarlo. No ofrecer una ronda ya terminada. El pago aprobado deja el pedido pendiente de preparar/entregar, no entregado automáticamente.
5. Reservar existencias mientras se paga y liberarlas al cancelar o expirar. Importes calculados en el servidor; reintentos y notificaciones duplicadas no deben cobrar ni descontar dos veces.
6. Integración futura con Mercado Pago Point mediante Orders y una terminal compatible con el modo de integración disponible en Chile. Antes de comprar, confirmar compatibilidad del modelo y disponibilidad de autoservicio para la cuenta. Una terminal independiente no garantiza integración automática.
7. Confirmar el estado del pago con Mercado Pago desde el servidor. Un mensaje del navegador nunca confirma un cobro. Validar firma, identidad del comercio, moneda, importe y referencia del pedido. Reconciliar si una notificación llega tarde.
8. Pantalla del personal: pagados por preparar / listos / entregados, con mesa y ronda. Mostrar alertas de nuevos pedidos sin depender de que el cliente diga que pagó.
9. Mantener cerveza en atención del personal mientras se diseña el autoservicio. No añadirla por defecto a una promo sin la decisión del dueño.

## Recursos

El menú puede usar texto e iconos del proyecto: no necesita imágenes ni nuevo almacenamiento multimedia. Los pedidos sí agregan registros pequeños. La integración de pagos debe procesar notificaciones y hacer conciliación acotada; no consultar continuamente desde todos los navegadores. Hay comisiones de procesamiento de Mercado Pago; desarrollar la herramienta no elimina esos costos.

## Evidencia técnica

- `components/AdminApp.tsx`, `PosPage`: pantalla protegida que registra un pago recibido, no envía un cobro a una terminal.
- `lib/server/commerce.ts`, `completePos`: exige administrador y crea ventas con pago aprobado y entrega completada.
- El catálogo actual no tiene separación de canal local/web. Agregar alimentos como productos publicados comunes los haría elegibles para la tienda online.

Documentación del proveedor consultada el 14-10-2026:

- https://www.mercadopago.cl/developers/es/docs/mp-point/overview
- https://www.mercadopago.cl/developers/es/docs/mp-point/configure-terminal
- https://www.mercadopago.cl/developers/es/docs/mp-point-v2/overview?scope=prod

## Menú interno implementado — 14-10-2026

En Administración → Venta en el local → Menú del local se muestran las bebidas, completo y promo. Dentro de «Cargar o ajustar existencias del menú» se modifica el stock real de cada artículo; los precios se fijan en el servidor. La promo descuenta los componentes y no tiene existencias propias. Cerveza se vende por separado.

Las tablas privadas `pos_menu_items` y `pos_menu_movements` quedan fuera de `products`, por lo que no entran al catálogo, guías ni checkout web. Se registra cada ajuste y venta con su administrador. Las ediciones de stock requieren versión vigente; los tickets son atómicos e idempotentes.

El POS sigue siendo una herramienta del personal para registrar pagos ya recibidos; todavía no se conectó Mercado Pago ni se habilitó un autoservicio público. Se puede registrar entrega ahora, durante la ronda actual o en ronda 2. Para entregas por ronda se exige mesa y el pedido permanece recibido hasta marcarlo preparado/entregado en Pedidos. La opción «ronda 2» es una solicitud manual, todavía no se valida contra el calendario vivo de un torneo.

Pruebas locales: catálogo privado y bloqueo de compra online por identificador, permisos, versión de stock, importes de servidor, componentes de promo, exclusión de alcohol, rollback, idempotencia, ventas mixtas TCG/menú, entrega por ronda y competencia por últimas unidades. No se crean ventas ni cobros de prueba en producción.

## Catálogo agrupado solo en el POS — 14-10-2026

Dentro de «Cartas y productos», el POS ofrece accesos a Accesorios, Sobres, Token Box, Toolkits y kits, Displays y cajas, Mazos y Singles. Los accesorios se agrupan por la familia explícita del catálogo; al elegir una variante se muestran su imagen, precio y stock exactos. El ticket recibe el identificador original de esa variante, conservando su inventario independiente. La búsqueda admite colores, formatos, tipos y SKU.

Sobres, token box, kits y demás sellados conservan su tarjeta individual por presentación e idioma. Los kits raciales MyL se incluyen en Toolkits y kits. Se muestran los artículos publicados de tipo Tienda incluso sin stock, pero no se permite venderlos agotados. Borradores y preventas no se publican ni cambian de tipo mediante esta herramienta.

Este cambio afecta únicamente el panel administrativo: la tienda online conserva sus tarjetas individuales. Se reutilizan las imágenes y los datos existentes; no se agregan archivos de imágenes a Storage ni consultas a fuentes externas.
