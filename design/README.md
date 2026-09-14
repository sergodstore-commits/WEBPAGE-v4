# Design workspace

- `approved/`: única fuente de assets visuales aprobados para producción.
- `source-existing/`: assets heredados del proyecto anterior; útiles como materia prima, pero **no aprobados automáticamente**.
- `references/`: composiciones/mockups de referencia; no deben publicarse como assets finales por defecto.
- `elementos-pagina1-hq-4x/`: respaldo técnico 4× de la lámina `sheet_03`, con manifiesto e índices de localización. Se conserva como fuente; no se copia completo al sitio ni convierte sus rótulos horneados en contenido público.
- `manifest/`: procedencia y SHA-256.

La biblioteca aprobada se controla mediante:

- `manifest/APPROVED-ASSETS.json`: logo oficial y manifiestos incluidos.
- `manifest/APPROVED-UI-ASSETS.json`: 106 recursos UI sin texto aprobados por el propietario el 2026-08-25.

El texto visible, los estados, la navegación y los números de página se construyen como contenido web dinámico; las variantes con texto horneado no están aprobadas.

Las reglas visuales normativas viven en `docs/CURRENT/11-DISENO-E-IDENTIDAD-VISUAL.md`.
