# 06 — UX y Presentation

## Principios

- La UI representa estado real del servidor; no simula éxito.
- Responsive desde componentes base, no como parche final.
- Accesibilidad: teclado, foco, contraste, labels, estados y errores legibles.
- Móvil debe soportar las tareas críticas de compra, cuenta y operación Admin/POS pertinente.

## Navegación pública

`/` es un lanzador visual de altura completa, sin encabezado general ni bloques promocionales debajo.
Por la decisión posterior del propietario, presenta el logo oficial y cinco destinos principales:
Tienda, Preventas, Noticias, Torneos y Comunidad; Cuenta y Carrito son accesos secundarios. Cómics y
Puntos Sergod dejan de ser destinos del lanzador. Esto no elimina datos ni reglas comerciales existentes.
Cambiar el arte de un acceso no puede cambiar su ruta ni su nombre accesible.

Comunidad agrupa Noticias, Torneos, Quests y Visítanos como pestañas de una misma área. Las rutas
históricas `/news`, `/tournaments` y `/quests` siguen siendo enlaces directos válidos hacia la pestaña
correspondiente. Las publicaciones de actividad comunitaria existentes se muestran junto a Noticias
para no perder contenido durante la consolidación.

El encabezado principal aparece al entrar a una sección: Inicio, Tienda, Preventas, Comunidad,
Torneos y Noticias; Cuenta y Carrito permanecen disponibles. La cabecera adapta todos los
destinos a un menú compacto antes de que puedan envolverse, comprimirse o interferir con el contenido.

El lanzador puede usar movimiento expresivo para presentar y seleccionar destinos. Las páginas de
compra, cuenta y operación usan transiciones más breves: la animación nunca retrasa una acción ni
reemplaza el estado real del servidor.

## Catálogo

- filtros visibles y chips activos;
- búsqueda y ordenamiento;
- disponibilidad pública por estado, no cantidad exacta;
- atributos idioma/edición/condición legibles;
- productos sin sistema genérico de variantes.

## Checkout

Debe separar claramente:

- productos y grupos;
- descuentos/puntos;
- modalidad de entrega;
- `FREIGHT_COLLECT` como envío por pagar;
- total Sergod Store sin flete;
- proveedor de pago;
- resultado aprobado/pendiente/rechazado sin inferir éxito del redirect.

## Cuenta y Admin

Cuenta cliente prioriza pedidos, preventas, puntos, datos personales y preferencias de despacho. Admin prioriza operación real, no dashboards decorativos.

## Diseño

La dirección visual obligatoria está en `11-DISENO-E-IDENTIDAD-VISUAL.md`. Diseño no puede alterar reglas de negocio.
