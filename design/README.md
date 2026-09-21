# Design workspace

- `approved/`: única fuente de assets visuales aprobados para producción.
- `source-existing/`: assets heredados del proyecto anterior; útiles como materia prima, pero **no aprobados automáticamente**.
- `references/`: composiciones/mockups de referencia; no deben publicarse como assets finales por defecto.
- `references/visual-v2/`: dirección visual nueva solicitada por el propietario. Las 22 maquetas
  están en `deliverables/SERGOD-STORE-REFERENCIAS-VISUALES-V1/`; la portada empieza a reconstruirse
  en HTML/CSS con capas independientes. Tienda y Preventas se están adaptando con datos reales,
  controles y tarjetas independientes; las maquetas no se usan como fondos ni publicaciones.
  Esta propuesta aún no reemplaza `approved/`.
- `elementos-pagina1-hq-4x/`: respaldo técnico 4× de la lámina `sheet_03`, con manifiesto e índices de localización. Se conserva como fuente; no se copia completo al sitio ni convierte sus rótulos horneados en contenido público.
- `manifest/`: procedencia y SHA-256.

La biblioteca aprobada se controla mediante:

- `manifest/APPROVED-ASSETS.json`: logo oficial y manifiestos incluidos.
- `manifest/APPROVED-UI-ASSETS.json`: 106 recursos UI sin texto aprobados por el propietario el 2026-08-25.
- `manifest/APPROVED-HOME-LAUNCHER-ASSETS.json`: ocho rótulos ilustrados aprobados expresamente
  para los accesos vinculados de portada el 2026-09-14.

El texto visible, los estados, la navegación y los números de página se construyen como contenido
web dinámico. La única excepción son los ocho rótulos del lanzador documentados en su manifiesto:
su nombre accesible y su destino continúan siendo HTML independiente y protegido.

Las reglas visuales normativas viven en `docs/CURRENT/11-DISENO-E-IDENTIDAD-VISUAL.md`.
