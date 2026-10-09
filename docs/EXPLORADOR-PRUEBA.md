# Prueba del explorador de ediciones

Ruta aislada: /pruebas/explorador. Sin enlaces en la navegación y no indexable. No se ha integrado todavía en las fichas comerciales.

Por petición del propietario se retiraron el gráfico, la single de ejemplo y la consulta de historial. Conserva sobre, Token Box y display con las imágenes existentes y acceso destacado a las cartas de Beyond the Brave.

La lista abre Yu-Gi-Oh! Meta en una pestaña nueva; no se muestra dentro de SERGOD. El mismo acceso está disponible en las tarjetas de Tienda/Preventas y en las fichas y vistas rápidas de Beyond the Brave. El mapa de destinos verificados está en lib/edition-links.ts; las ediciones sin enlace verificado no muestran el botón. No se realiza scraping, no se inserta iframe ni se cargan recursos del proveedor al abrir la tienda. Sin nuevas dependencias, claves, servicios contratados, tablas, depósitos ni históricos locales.

No cambia productos, precios, stock ni variantes. Las cartas de la edición no garantizan el contenido aleatorio de una presentación ni sus extras particulares. MyL y la lista integrada siguen pendientes de una fuente adecuada a las restricciones del proyecto.

Validación: selección de presentación, enlace a lista, ausencia de iframe y solicitudes al proveedor al cargar, ausencia de escrituras API y ancho móvil.
