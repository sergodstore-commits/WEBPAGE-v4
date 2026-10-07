# Panel administrativo

El rediseño reutiliza los formularios y operaciones existentes. `components/admin/AdminShell.tsx` organiza la navegación y `components/admin/AdminTheme.css` aplica la presentación compartida sobre los estilos de formularios de `components/admin.css`.

La navegación se divide en Catálogo (artículos, inventario, preventas), Ventas (pedidos y entregas, POS, clientes), Comunidad y contenido (torneos, liga/rankings, transmisiones, noticias y publicaciones manuales) y Configuración (integraciones y datos del local). «Nuevo artículo» permanece como acción principal. El resumen muestra cifras de la base de datos y accesos a preparación de pedidos, inventario, POS, preventas, noticias y configuración.

El escritorio usa una barra lateral con desplazamiento independiente; hasta 900 px se convierte en menú móvil. El menú bloquea el fondo, mantiene el foco dentro, admite Escape, devuelve el foco al cerrar y lleva la navegación al contenido de la página elegida. El panel muestra la sección activa y distingue alta, edición y detalle de pedido. Los correos de prueba conservan su acceso desde el resumen únicamente en desarrollo.

La identidad utiliza el logo optimizado existente, Inter local, barra lateral grafito, acentos cian y formularios claros. Las tablas conservan desplazamiento interno en pantallas estrechas. No se agregaron servicios, dependencias, campos comerciales ni migraciones.

## Comprobación local

`tests/e2e/admin-design.spec.ts` comprueba navegación agrupada, sección activa, pantallas de trabajo de 320 a 1440 px y manejo del menú con teclado, cierre, cambio de página y cambio de tamaño. Las regresiones de `tests/e2e/store.spec.ts` comprueban creación, imagen, publicación, lectura pública/recarga, edición y retiro de artículos y preventas, POS con efectivo/cambio/stock compartido, configuración y publicaciones manuales. Los datos se guardan realmente en la base aislada `.data/e2e`; no se realizan cobros ni se modifica producción.

Esta fase forma parte de la entrega final del 7 de octubre junto con Carrito, Cuenta y Checkout. Las comprobaciones generales y las integraciones pendientes están en `VERIFICATION.md`.
