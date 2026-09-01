# 03 — Reglas de negocio

## Dinero y tiempo

- CLP se representa como entero, sin flotantes monetarios.
- Persistencia temporal en UTC; presentación usa la zona configurada cuando corresponda.
- Ventanas y duraciones comerciales configurables viven en configuración, no escondidas en UI.

## Inventario

- Inventory es propietario del stock.
- `available = on_hand - reserved` y no puede ser negativo.
- Ecommerce y POS consumen la misma autoridad de stock.
- Público ve `Disponible`, `Últimas unidades` o `Agotado`; ADMIN puede consultar cantidades operativas.

## Carrito

- El carrito conserva intención; las reservas comerciales se materializan en el flujo de Order/pago cuando corresponda.
- Precio, disponibilidad, promociones, puntos y condiciones se revalidan en servidor antes de crear Order.
- El carrito anónimo puede fusionarse con el autenticado de forma idempotente sin perder líneas.
- Incompatibilidades se conservan en `CONFLICT` y requieren resolución explícita.

## Checkout / entrega

- Compra online requiere CLIENTE elegible y autenticado según Identity.
- Modalidades: `PICKUP` o `FREIGHT_COLLECT` a `CARRIER_AGENCY`.
- Carrier de despacho: Chilexpress o Starken.
- El flete se paga al transportista y no integra el total cobrado por Sergod Store.
- La UI comunica explícitamente que el despacho es por pagar.

## Order

Estados internos:

```text
PENDING_PAYMENT
  ├─ pago aprobado → PAID
  └─ expiración/cancelación válida → CANCELLED
PAID → PREPARING
PREPARING + PICKUP → READY_FOR_PICKUP → FULFILLED
PREPARING + FREIGHT_COLLECT → SHIPPED → FULFILLED
```

### Número público

- Identificador interno: UUID.
- Número público: `SG-{AAAA}-{NNNNNN}`, por ejemplo `SG-2026-000001`.
- Debe ser único y generado con seguridad concurrente.
- El número público nunca autoriza acceso por sí solo.

### Reserva de pago

`PENDING_PAYMENT` puede proteger stock/cupo durante una ventana configurable mediante `PAYMENT_RESERVATION_DURATION_MINUTES` o contrato CURRENT equivalente.

## Cancelación

- La cancelación se aplica únicamente en estados permitidos por Order.
- Libera reservas/cupos de forma idempotente.
- Si ya existe una operación monetaria externa confirmada, su resolución se registra según hechos confirmados por el proveedor.

## Payments

- `Payments` es propietario de `PaymentAttempt` y del adaptador Flow habilitado. El adaptador
  Webpay Plus histórico permanece inactivo y fuera de la operación productiva V1.
- El retorno del navegador no aprueba un pago por sí solo.
- La aprobación requiere verificación oficial del proveedor.
- Notificaciones duplicadas son idempotentes.
- Un Order puede tener varios intentos, pero solo una aprobación efectiva consolidada.
- No se almacenan datos de tarjeta.

## Promociones / Loyalty

- Promociones, cupones y puntos se calculan en servidor.
- La previsualización no consume usos/puntos; la confirmación idempotente registra el consumo correspondiente.
- Los límites por uso se aplican sobre los actores/canales definidos por la promoción.
- El historial conserva snapshots suficientes para explicar una venta o pedido.

## Preventas

- La campaña define producto, sucursal, ventana, capacidad, disponibilidad y condiciones publicables.
- El carrito conserva intención de preventa.
- El flujo confirmado crea el compromiso correspondiente y actualiza capacidad de manera transaccional/idempotente.
- El cierre bloquea nuevos compromisos y conserva los existentes.

## POS

- Registra ventas físicas sin procesar datos de tarjeta.
- Puede operar con venta anónima o cuenta CLIENTE.
- Aplica promociones/cupón/puntos mediante reglas de servidor.
- Registra efectivo, débito, crédito, transferencia u otro medio externo.
- Referencia y nota son opcionales.
- La confirmación consume inventario compartido y deja historial auditable.

## Contenido editorial

ADMIN administra torneos editoriales, noticias, comunidad y cómics/historias. El contenido publicado se expone mediante superficies públicas correspondientes.
