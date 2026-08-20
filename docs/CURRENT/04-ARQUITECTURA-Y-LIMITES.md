# 04 — Arquitectura y límites

## Stack vigente

- Node.js 24 / npm 11.
- TypeScript estricto.
- React 19 + Vite 8.
- API Node.js modular.
- PostgreSQL + Supabase Auth/Storage.
- Vitest, ESLint, Prettier.

## Capas backend

```text
domain ← application ← infrastructure
                    ↖ presentation
```

Domain no depende de HTTP/DB/React. Application orquesta mediante puertos. Infrastructure implementa persistencia/proveedores. Presentation expone HTTP.

## Contextos actuales útiles

- IdentityAccess
- Catalog
- Inventory
- Promotions
- Loyalty
- Preorders
- SalesPOS
- CommerceOrders (cart/checkout; completar Order)
- SystemConfiguration
- ServiceCoverage (reducido a semántica vigente de despacho)

## Contextos/capacidades a completar

- Orders definitivo dentro de CommerceOrders o separación coherente si el código lo exige.
- Payments.
- Notifications.
- Content editorial: torneos/noticias/comunidad/cómics, con límites simples.

## Límites

- Inventory es dueño de stock.
- Payments es dueño de intentos/confirmaciones de proveedor.
- Identity es dueño de cuenta/rol/estado.
- Promotions/Loyalty conservan sus propios movimientos/consumos.
- No crear un mega-repositorio que mezcle ownership de contextos.

## Dependencias y eventos

Preferir orquestación explícita de Application y contratos estables. Outbox/Inbox se usan cuando existe necesidad asíncrona real; no introducir eventos por decoración arquitectónica.

## Infraestructura de producción objetivo

- `apps/web` → Vercel.
- `apps/api` → Render Web Service (servidor Node persistente).
- jobs lifecycle/expiration → Render Cron Jobs; notificaciones puede ejecutarse como polling continuo explícitamente habilitado o como job one-shot.
- PostgreSQL/Auth/Storage → Supabase.
- Docker no es requisito del desarrollo local; Supabase local completo puede usarlo opcionalmente.

## Seguridad

- Autorización siempre en servidor.
- RLS/default-deny donde corresponda.
- Secrets únicamente en entorno/secret stores.
- CORS/origins explícitos por ambiente.
- Rate limiting apropiado para endpoints públicos/críticos.
- Logging sin secretos/tokens.
