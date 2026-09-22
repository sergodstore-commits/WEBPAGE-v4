# 11 — Diseño e identidad visual

## Estado actual

La identidad visual de la interfaz está deliberadamente pendiente de un rediseño integral. El
repositorio conserva una base neutral para permitir que el nuevo sistema se construya sin heredar ni
imitar propuestas anteriores.

## Autoridad conservada

- El logo oficial ubicado en `design/brand/` es inmutable.
- No regenerar, recolorear, deformar, recortar ni sustituir el logo.
- Las decisiones visuales futuras requieren aprobación expresa del propietario antes de considerarse
  parte de CURRENT.

## Límites funcionales del rediseño

- No alterar rutas, permisos, contratos, datos, reglas comerciales ni estados del servidor.
- Mantener navegación por teclado, foco visible, contraste suficiente, labels y mensajes legibles.
- Mantener las tareas críticas operables en escritorio y móvil.
- Los textos, precios, estados y vínculos deben seguir siendo contenido web real, no texto horneado en
  imágenes.
- Los recursos del catálogo y del contenido editorial continúan siendo datos administrables, no parte
  de la identidad estática.

## Base del repositorio

- `design/brand/` contiene únicamente el logo oficial.
- `apps/web/src/styles/base.css` aporta solo estructura neutral, responsive y accesibilidad.
- No existe una biblioteca visual aprobada ni una estética de producción vigente en este punto de
  partida.
