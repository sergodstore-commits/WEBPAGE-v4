# Implementation Status — baseline CURRENT

> Fotografía de trabajo. Stage 00 debe revalidarla en el Windows de ejecución antes de avanzar.

| Área                       | Estado conocido                  | Siguiente objetivo                              |
| -------------------------- | -------------------------------- | ----------------------------------------------- |
| Foundation transversal     | Avanzado                         | Revalidar y conservar                           |
| Identity & Access          | Avanzado                         | Revalidar y completar UX de cuenta              |
| Catalog backend/public API | Avanzado                         | Completar filtros y UX pública                  |
| Inventory                  | Avanzado                         | Revalidar invariantes compartidas               |
| Promotions/Coupons         | Avanzado                         | Revalidar integración checkout/POS              |
| Loyalty                    | Avanzado                         | Revalidar integración checkout/POS/cuenta       |
| Preorders                  | Núcleo simplificado implementado | Revalidar campaña/capacidad/compromisos         |
| Pseudo-POS                 | Núcleo implementado              | Revalidar venta, medios, inventario e historial |
| Cart                       | Avanzado                         | Revalidar                                       |
| Checkout                   | Preimplementado hacia Order          | Auditar integración/idempotencia/reservas         |
| Freight collect nacional   | Implementado                     | Revalidar extremo a extremo                     |
| Order definitivo           | Preimplementado, no aceptado         | Codex debe auditar stages 04-05 y gates oficiales |
| Payments Flow/Webpay       | Pendiente                        | Implementar                                     |
| Cuenta cliente final       | Parcial                          | Completar                                       |
| Admin final                | Backend parcial/avanzado         | Completar UI y operaciones faltantes            |
| Web pública final          | Parcial                          | Implementar superficies finales                 |
| Torneos editoriales        | Pendiente                        | Implementar                                     |
| Noticias/Comunidad/Cómics  | Pendiente                        | Implementar                                     |
| Email transaccional        | Pendiente                        | Implementar                                     |
| UX visual final            | Assets/referencias disponibles   | Integrar por stages de diseño                   |
| Hardening/release          | Parcial                          | Cerrar al final                                 |

## Regla de actualización

Cada stage cerrado actualiza este estado con evidencia ejecutada. Una integración externa solo puede marcarse `PASS` cuando se haya validado contra el entorno requerido.

## Preimplementación externa a la misión

Se agregó un punto de partida de Orders + Checkout para reducir trabajo de construcción de Codex. Esto **no** avanza `.codex-mission/STATE.json` ni sustituye los gates de los stages 04-05. Codex debe auditar/corregir esta base antes de aceptar esos stages. Detalle: `docs/IMPLEMENTATION-AUDIT/ORDERS-CHECKOUT-PREIMPLEMENTATION.md`.
