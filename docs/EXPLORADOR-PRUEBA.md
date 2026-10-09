# Prueba del explorador de ediciones

Ruta aislada: `/pruebas/explorador`. Sin enlaces en la navegación e indicada como no indexable. No se ha integrado todavía en las fichas comerciales.

Beyond the Brave usa los productos publicados e imágenes existentes del catálogo. No agrupa ni cambia precio, stock o variantes en Tienda. Solo consulta el catálogo público mediante GET.

Dark Time Wizard · Ultra Rare muestra el iframe generado por el configurador oficial de TCGIndex. Se carga únicamente al pulsar el botón; Actualizar vuelve a cargarlo. No consulta una API privada ni extrae sus datos. No hay nuevas dependencias, claves, servicios contratados, tablas, depósitos ni históricos locales. El iframe consume red y recursos del navegador al abrirlo; no supone consumo cero.

Fuente: https://tcgindex.io/publishers — el proveedor presenta el widget estándar como gratuito con atribución. No podemos garantizar sus condiciones futuras, cobertura, disponibilidad ni frecuencia de actualización. Sus valores pueden diferir de otras fuentes o de su propia ficha; no se presentan como precios de venta SERGOD ni como reproducción exacta de TCGplayer.

Limitaciones: el widget solo muestra una carta preseleccionada. La lista ordenada por precio abre la página externa de la edición; no está insertada ni se puede ordenar desde SERGOD. No se ha resuelto catálogo completo, selección arbitraria de singles, extras de Token Box ni MyL con las restricciones actuales. El valor total de una edición no debe presentarse como precio de caja o rendimiento esperado.

Validación automatizada: proveedor simulado para comprobar carga bajo demanda, actualización, selección de presentación, ausencia de escrituras API y ancho móvil. Validación real del widget se realiza aparte en navegador; los tests simulados no prueban exactitud de precios.
