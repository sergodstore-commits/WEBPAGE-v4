# 13 — Orders, pagos y fulfillment

## Order mínimo V1

Debe conservar de forma auditable:

- líneas y cantidades;
- precios y snapshots aplicables;
- promociones/cupón/puntos;
- tipo `REGULAR`/`PREORDER` cuando corresponda;
- modalidad y datos de entrega;
- total cobrado por Sergod Store;
- estado;
- referencias a `PaymentAttempt`;
- historial/auditoría.

## Estados

`PENDING_PAYMENT`, `PAID`, `PREPARING`, `READY_FOR_PICKUP`, `SHIPPED`, `FULFILLED`, `CANCELLED`.

La UI puede mostrar “Retirado” o “Entregado” para `FULFILLED` según modalidad.

Un Order cuyo total sea cero se confirma transaccionalmente como `PAID` durante checkout. No queda en `PENDING_PAYMENT`, no crea `PaymentAttempt` externo y conserva las transiciones `NULL → PENDING_PAYMENT → PAID` en `order_state_history`.

## Pago

Flow y Webpay Plus son adaptadores independientes bajo Payments. La confirmación del proveedor se verifica y procesa de forma idempotente; el redirect del navegador es solo parte de UX.

Al confirmar un Order se consumen de forma idempotente las reservas de inventario/preventa, los usos de promociones/cupón y la reserva/movimientos de loyalty usando los snapshots CURRENT del checkout. La transacción crea fulfillment y escribe el historial de Order.

El retorno Flow configurado es la ruta API real `/api/v1/payments/flow/return`; confirmación Flow y retornos Flow/Webpay verifican estado server-to-server.

## Fulfillment

### Retiro

`PAID → PREPARING → READY_FOR_PICKUP → FULFILLED`.

La operación identifica el pedido y registra la transición auditable correspondiente.

Cada transición escribe tanto `fulfillment_events` como `order_state_history` en la misma transacción y encola la notificación idempotente correspondiente cuando aplica.

### Despacho

`PAID → PREPARING → SHIPPED → FULFILLED`.

El despacho es por pagar a agencia. El Order conserva destinatario, contacto, carrier, comuna y agencia/destino necesarios para preparar la entrega.

## Cancelación

`CANCELLED` preserva historial y libera reservas/cupos que correspondan de forma idempotente.
