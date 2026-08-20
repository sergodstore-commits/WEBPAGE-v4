# 06 — UX y Presentation

## Principios

- La UI representa estado real del servidor; no simula éxito.
- Responsive desde componentes base, no como parche final.
- Accesibilidad: teclado, foco, contraste, labels, estados y errores legibles.
- Móvil debe soportar las tareas críticas de compra, cuenta y operación Admin/POS pertinente.

## Navegación pública

Header principal: Inicio, Tienda, Torneos, Noticias, Comunidad; búsqueda, cuenta y carrito. Cómics/Historias puede vivir como entrada editorial adicional sin saturar navegación primaria.

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
