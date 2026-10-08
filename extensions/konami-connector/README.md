# Conexión de resultados de Konami

Complemento local gratuito para Chrome y Edge. No requiere un servicio de pago.

1. Descomprimir el ZIP del panel o usar esta carpeta del repositorio.
2. Abrir `chrome://extensions` o `edge://extensions`.
3. Activar Modo de desarrollador → Cargar descomprimida → seleccionar esta carpeta.
4. Recargar Konami y SERGOD STORE e iniciar sesión personalmente en ambas páginas.
5. Abrir un torneo finalizado y expandir detalles y resultados. Dejar desmarcado el filtro de jugadores retirados.
6. En Admin → Liga, pulsar **Obtener resultados de Konami**. Se usa el último torneo finalizado visitado en ese navegador. Revisar y confirmar la vista previa.

El complemento solo acepta solicitudes del documento principal de `https://www.sergodstore.cl/admin/liga`. Lee datos del torneo de Konami, sigue su paginación y entrega nombre, fecha, identificador y resultados al panel. No lee ni almacena contraseñas o cookies, no altera el torneo y no escribe en el servidor. La web conserva sus permisos de administrador, validaciones, confirmación, deduplicación y cálculo de 3 puntos por victoria. Los ID se convierten en identidades privadas en el servidor y no se muestran públicamente.

Se puede desactivar o quitar el complemento en cualquier momento. Sin él sigue disponible la importación KTS. No funciona en el navegador integrado de Codex, teléfonos o navegadores que no admitan extensiones Chromium. Los cambios de estructura o idioma de Konami pueden requerir actualizarlo; ante una tabla incompleta se rechaza la importación.
