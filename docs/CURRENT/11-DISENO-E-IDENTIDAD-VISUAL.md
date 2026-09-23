# 11 — Diseño e identidad visual

## Estado actual

El propietario aprobó el 2026-09-22 la nueva dirección visual de cliente: negro profundo, acentos
celestes, superficies oscuras translúcidas, bordes finos y navegación limpia. Se implementa como capa
independiente sobre la estructura neutral, sin recuperar propuestas visuales retiradas.

La portada incorpora profundidad 3D, iluminación ambiental, partículas discretas, entrada animada y
respuesta suave al cursor. El movimiento dispone de pausa y controles manuales, respeta movimiento
reducido y se suspende con la pestaña oculta. Las imágenes del carrusel provienen del catálogo
publicado; si no están disponibles, se muestran cartas decorativas identificadas como tales, nunca
productos, precios o estadísticas inventados.

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
- `apps/web/src/styles/client-theme.css` define la nueva capa de cliente, aislada del administrador.
- La nueva identidad sigue en revisión local; no se ha promovido a producción.
