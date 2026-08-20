# Stage 01-local-final-verification — conformidad y gates locales

## Objetivo

Auditar extremo a extremo lo implementado en Orders/Checkout, Payments, Flow/Webpay adapters, Fulfillment, Account/Admin, comercio público, editorial, diseño, notificaciones y hardening. Corregirlo hasta conformidad con CURRENT.

## Gates mínimos

- Unit, application, contract y web completos.
- PostgreSQL real local + migraciones + integration local; si el entorno no puede proveerlo, no marcar PASS.
- Build de producción y auditoría de entrega.
- Verificar específicamente `FREIGHT_COLLECT` en 0 sin domicilio y torneos solo editoriales.
- Revisión manual de seguridad, accesibilidad y estados de error.
