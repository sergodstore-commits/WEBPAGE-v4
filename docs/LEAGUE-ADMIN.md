# Panel de Liga

«Obtener resultados de Konami» y «Actualizar torneos de MyL» agregan todos los torneos finalizados elegibles encontrados a la lista, sin confirmar uno por uno. MyL recorre todas las páginas de ligas públicas de Primera Era y Primer Bloque de la tienda. Konami usa el complemento 1.1.0 en Brave/Chrome/Edge: abre su búsqueda, elimina el filtro de fecha, recorre las páginas y lee los resultados completos de los torneos finalizados de SERGOD STORE. Debe existir una sesión iniciada en ese navegador. Se devuelve a la pestaña original al terminar.

Los nuevos torneos se guardan sin sumar al ranking. Los ya guardados conservan resultados, título y selección; las correcciones siguen usando la vista previa y confirmación. Repetir la consulta no duplica torneos ni puntos. Los errores por torneo se muestran y se pueden reintentar; los resultados completos ya guardados se conservan. La fuente original no se modifica.

Cada ranking tiene selección, contador, búsqueda y enlace a Comunidad. «Guardar selección» verifica la lectura administrativa y pública. Yu-Gi-Oh!, Primera Era y Primer Bloque permanecen separados.

«Archivar» retira un torneo de la lista activa y del ranking, conservando sus resultados. No se agrega de nuevo al actualizar. En «Archivados» puede restaurarse; vuelve desmarcado. Guarda o descarta primero la selección pendiente de ese ranking antes de archivar. La eliminación definitiva anterior sigue en el historial; para ordenar usa Archivar.

La carga de archivos/tablas y el historial se pueden expandir. Requiere migración versionada 014_league_archive.sql; no añade variables ni permisos de extensión. Para actualizar el complemento ya instalado desde esta carpeta, pulsa Recargar en brave://extensions y recarga Konami y la tienda. Si se instaló desde otro ZIP, reemplaza su carpeta con el ZIP nuevo del panel antes de recargar.
