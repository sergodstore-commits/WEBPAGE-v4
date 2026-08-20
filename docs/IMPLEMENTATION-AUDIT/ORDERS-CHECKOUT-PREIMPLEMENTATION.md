# Orders + Checkout — preimplementación para auditoría Codex

## Propósito

Este bloque fue preimplementado antes de la ejecución oficial de los stages 04 y 05 para reducir trabajo de construcción repetitiva. **No constituye aceptación de esos stages**. Codex debe auditar, corregir y ejecutar los gates oficiales en Windows/Node 24/npm 11/PostgreSQL antes de marcar PASS.

## Implementado como punto de partida

- Aggregate/modelo persistido `Order` con estados CURRENT.
- Número público `SG-AAAA-NNNNNN` respaldado por contador anual bloqueable en PostgreSQL.
- Snapshots de líneas, entrega, promociones, cupón y loyalty al crear Order.
- `PENDING_PAYMENT` con `expires_at` derivado de `PAYMENT_RESERVATION_DURATION_MINUTES` activo.
- Reserva REGULAR mediante `inventory_positions.reserved` y ledger `RESERVATION_CREATED`.
- Reserva PREORDER mediante `preorder_campaigns.temporarily_reserved`.
- Liberación idempotente de reservas al expirar `PENDING_PAYMENT`.
- Historial de estado de Order.
- Creación idempotente desde checkout autenticado.
- Un solo Order por `cart_group_id`.
- Lectura de Orders de la cuenta y lectura Admin.
- Job local `orders:expire`.
- Migración prospectiva 016 + equivalente Supabase; ninguna migración protegida previa fue editada.

## Endpoints preimplementados

- `POST /api/v1/checkout/groups/{cartGroupId}/order`
- `GET /api/v1/orders`
- `GET /api/v1/orders/{orderId}`
- `GET /api/v1/admin/orders`
- `GET /api/v1/admin/orders/{orderId}`

La creación requiere `Idempotency-Key` y cuerpo JSON `{}`.

## Puntos que Codex DEBE reauditar antes de aceptar

1. **Promotions/Loyalty reservation semantics.** La preimplementación conserva snapshots al crear `PENDING_PAYMENT`, pero no introduce todavía una capa adicional de reserva temporal de usos de cupón/promoción ni de puntos. Payments Core debe definir con precisión el momento de consumo/rollback y Codex debe comprobar que no exista sobreasignación bajo concurrencia.
2. **Zero-total Orders.** La preimplementación crea `PENDING_PAYMENT` incluso cuando `requiresExternalPayment=false`. Payments Core debe decidir/implementar la consolidación idempotente del caso de total cero conforme a CURRENT sin inventar un proveedor externo.
3. **Cart lifecycle after Order creation.** Se conserva el grupo de carrito como evidencia/intención histórica y se impide un segundo Order con `UNIQUE(cart_group_id)`. Codex debe revisar la UX/limpieza del carrito y cualquier transición necesaria sin destruir trazabilidad.
4. **Preorder conversion on payment.** Este bloque solo incrementa `temporarily_reserved`. La conversión a compromiso pagado pertenece a Payments/Preorders y debe ser transaccional e idempotente.
5. **Inventory conversion on payment.** Este bloque solo reserva. La conversión `reserved → consumed` se implementará al confirmar pago y debe conservar ledger/invariantes.
6. **HTTP pagination.** La lista usa cursor UUID simple como punto de partida. Codex puede sustituirlo por cursor compuesto estable si CURRENT/UX final lo exige.
7. **PostgreSQL integration.** Deben ejecutarse upgrade + fresh install y pruebas reales de locking/concurrencia en PostgreSQL objetivo.
8. **Node target.** Esta preimplementación no se declara validada en Node 24 hasta ejecutar el gate oficial del stage 00/stages 04-05.

## Regla de continuidad

No modificar CURRENT para justificar esta implementación. Si Codex encuentra divergencias, debe corregir código/migración prospectiva/tests y mantener las reglas comerciales de CURRENT como autoridad.
