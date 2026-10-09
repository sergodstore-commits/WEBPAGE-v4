# Actualidad Yu-Gi-Oh!

Noticias muestra publicaciones SERGOD a la izquierda y actualidad Yu-Gi-Oh! a la derecha; las columnas se apilan en móvil.

En Admin → Noticias → Actualidad Yu-Gi-Oh!, añade el enlace, fecha, título y resumen propio en español. Pulsa Añadir a la lista y Guardar selección de actualidad. Editar permite corregir textos; desmarcar Mostrar retira la tarjeta. La configuración conserva hasta 80 referencias, sin nuevas tablas; los elementos ocultos solo se entregan al admin.

## Beyond the Brave

La tarjeta del enlace https://www.yugiohmeta.com/articles/sets/tcg/betb ofrece Leer en español · Ver todas las cartas, hacia /noticias/beyond-the-brave, además del original. Tienda/Preventas y fichas de la familia Beyond abren la misma guía interna.

La guía tiene redacción propia, búsqueda por nombre español/inglés o código, filtro de rareza y 100 cartas distintas (BETB-EN001–100). Las variantes de rareza comparten ficha. El diálogo muestra imagen ampliada, nombre y texto español con enlace oficial Konami. Las imágenes conservan su idioma original. La lista no garantiza el contenido de un sobre ni mezcla extras de otros productos.

scripts/import-betb-gallery.mjs prepara manualmente la edición: consulta la API documentada de YGOPRODeck, guarda sus imágenes una vez, obtiene el texto español de cada ficha oficial y genera WebP de 600 px y miniaturas de 220 px. Conserva fuentes en .data/betb-import/, ignorado por Git; publica solo JSON y WebP en public/editions/betb/. Comprueba 100 cartas, textos y entidades antes de escribir el JSON final. Ejecutar node scripts/import-betb-gallery.mjs, revisar y desplegar. Para refrescar una fuente hay que retirar explícitamente su caché después de revisarla; no realiza consultas redundantes en cada ejecución.

El paquete completo pesa aproximadamente 12,6 MB decimales (12,0 MiB); miniaturas 1,8 MB. Se sirve estáticamente en Vercel, sin almacenamiento Supabase, funciones por carta, traducción de pago ni solicitudes de visitantes a proveedores. Las miniaturas usan carga diferida y la imagen grande solo aparece al abrir una ficha. El ancho de banda depende de las visitas: no es consumo cero.

Las demás noticias siguen como selección manual con resúmenes originales. No se copian artículos completos. Detección automática pendiente de una API, feed o permiso adecuado. La edición es una instantánea revisada el 09-10-2026, no sincronización en tiempo real.
