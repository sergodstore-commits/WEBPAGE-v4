# Conexión de resultados de Konami

Complemento local gratuito para Brave, Chrome y Edge. No requiere un servicio de pago.

1. Descomprimir el ZIP del panel o usar esta carpeta del repositorio.
2. Abrir `brave://extensions`, `chrome://extensions` o `edge://extensions`.
3. Activar Modo de desarrollador → Cargar descomprimida → seleccionar esta carpeta.
4. Recargar Konami y SERGOD STORE e iniciar sesión personalmente en ambas páginas.
5. Mantener Konami abierto con la sesión iniciada, en español. Dejar desmarcado el filtro de jugadores retirados.
6. En Admin → Liga, pulsar **Obtener resultados de Konami**. Busca todos los torneos finalizados de SERGOD STORE, sin filtro de fecha, con todas sus páginas y jugadores. La web guarda los nuevos sin sumarlos al ranking; marca los que quieres sumar y guarda la selección.

El complemento solo acepta solicitudes del documento principal de `https://www.sergodstore.cl/admin/liga`. Navega a la búsqueda y a las fichas de torneos finalizados, sigue su paginación y entrega nombre, fecha, identificador y resultados al panel. Al terminar regresa a la página original. No lee ni almacena contraseñas o cookies, no altera el torneo y no escribe en el servidor. La web conserva sus permisos de administrador, validaciones, selección manual de qué torneos suman, deduplicación y cálculo de 3 puntos por victoria. Los ID se convierten en identidades privadas en el servidor y no se muestran públicamente.

Se puede desactivar o quitar el complemento en cualquier momento. Sin él sigue disponible la importación KTS. No funciona en el navegador integrado de Codex, teléfonos o navegadores que no admitan extensiones Chromium. Los cambios de estructura o idioma de Konami pueden requerir actualizarlo; ante una tabla incompleta se rechaza la importación.

Versión 1.1.0: si ya está instalado desde esta carpeta, pulsa Recargar en la página de extensiones y recarga Konami y la tienda. No requiere permisos nuevos. Si usas una copia descomprimida en otra carpeta, reemplázala con el ZIP actualizado primero.
