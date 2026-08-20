# Política de agentes

## Default

Usar **un solo agente principal**. La misión no requiere un enjambre ni paralelización permanente.

## Subagente permitido

Solo cuando exista una razón concreta que compense contexto duplicado:

- revisión independiente de Payments/seguridad/RLS/migración crítica/release;
- exploración aislada que reduzca claramente el contexto del agente principal;
- dos trabajos verdaderamente independientes, con archivos disjuntos y ahorro material de tiempo.

## Restricciones

- No crear subagente para CSS simple, CRUD localizado, renombres, tests mecánicos ni búsqueda ordinaria.
- No dar a un subagente CURRENT completo si solo necesita una sección.
- No enviar razonamiento previo del implementador al revisor; compartir hechos, diff, contratos y gates.
- No permitir dos writers sobre los mismos contratos, migraciones o archivos.
- No usar Bernstein, Polywave, AuraKit u otros orquestadores multiagente como default.
- Si hay duda sobre el beneficio, no crear subagente.
