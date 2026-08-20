---
name: sergod-payment-guardian
description: Gobierna Orders/Payments y adaptadores Flow/Webpay Plus de Sergod Store. Usar en creación de pagos, callbacks/returns, verificación de proveedor, reintentos, concurrencia, reservas y transiciones de Order.
---

# Sergod Payment Guardian

1. `Order` y `PaymentAttempt` conservan responsabilidades separadas.
2. El retorno del navegador nunca constituye confirmación autoritativa de pago.
3. Confirmar solo mediante respuesta/callback verificable del proveedor según contrato oficial vigente.
4. Procesar confirmaciones y reintentos idempotentemente.
5. Verificar importe, moneda, referencia/order y estado esperado antes de mutar Order.
6. Nunca almacenar datos de tarjeta ni registrar secretos/tokens sensibles.
7. Probar duplicados, callbacks fuera de orden, rechazo, timeout y reintento.
8. Si sandbox no está disponible, completar adaptador/fixtures/contracts y registrar `DEFERRED_EXTERNAL` sin declarar validación externa.
