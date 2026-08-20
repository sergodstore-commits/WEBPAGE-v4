# Stage 02-external-providers — proveedores reales de aceptación

## Objetivo

Con credenciales suministradas de forma segura, validar Flow sandbox, Webpay Plus integración y email transaccional. Payments Core debe continuar agnóstico y no se integra POS físico Transbank.

## Evidencia exigida

- Pago aprobado, rechazado, cancelado, callback repetido, firma inválida y pago tardío por proveedor.
- Verificación server-to-server autoritativa y reconciliación idempotente.
- Email enviado, reintento y fallo permanente sin exponer PII/secrets.
- Cero credenciales persistidas en Git o logs.

Sin credenciales, mantener `DEFERRED_EXTERNAL`; jamás inferir PASS desde mocks.
