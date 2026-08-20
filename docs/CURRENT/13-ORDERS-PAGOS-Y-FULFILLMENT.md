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

## Pago

Flow y Webpay Plus son adaptadores independientes bajo Payments. La confirmación del proveedor se verifica y procesa de forma idempotente; el redirect del navegador es solo parte de UX.

## Fulfillment

### Retiro

`PAID → PREPARING → READY_FOR_PICKUP → FULFILLED`.

La operación identifica el pedido y registra la transición auditable correspondiente.

### Despacho

`PAID → PREPARING → SHIPPED → FULFILLED`.

El despacho es por pagar a agencia. El Order conserva destinatario, contacto, carrier, comuna y agencia/destino necesarios para preparar la entrega.

## Cancelación

`CANCELLED` preserva historial y libera reservas/cupos que correspondan de forma idempotente.
