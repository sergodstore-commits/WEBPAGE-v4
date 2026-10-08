# Remanente de preventas

En el editor de preventas se configura una fecha de lanzamiento y la opción «Pasar el remanente automáticamente a Tienda». La fecha usa el calendario de Chile. El cierre de reservas sigue siendo independiente: el traslado ocurre cuando ambas fechas se han cumplido.

Solo se trasladan artículos publicados, no borrados, con stock libre (`stock - reserved > 0`). Los borradores, retirados, agotados, artículos sin fecha o con automatización desactivada permanecen en Preventas. Al liberar una reserva, el remanente podrá trasladarse en la siguiente comprobación.

Se conserva el SKU, identificador, precio, imágenes, inventario y condiciones originales. Las reservas pendientes siguen reteniendo sus unidades y los pedidos anteriores conservan su descripción como preventa. No se crean duplicados. `moved_to_store_at` registra el traslado y la versión del artículo invalida editores abiertos anteriormente.

La comprobación se ejecuta al consultar el catálogo o una ficha, antes de comprar por web/POS y en el trabajo existente `/api/jobs/reconcile`. No se necesita un servicio ni un plan adicional. Sin visitas, el trabajo existente hace la comprobación; el catálogo siempre comprueba antes de responder.

Migración: `017_preorder_release.sql`. Las preventas existentes comienzan sin fecha de lanzamiento; el administrador debe indicarla. No se deduce del cierre ni de textos de entrega.

Los filtros públicos agrupan las categorías en Yu-Gi-Oh!, Mitos y Leyendas, Accesorios y Otros (solo si hay artículos de otras categorías). Los accesos superiores mantienen Primera Era y Primer Bloque separados. No se modifica la categoría guardada en el panel.
