# Actualidad Yu-Gi-Oh!

## Banlist TCG en Comunidad

En Admin → Noticias, **Actualizar banlist TCG** consulta la base oficial de Konami en español y guarda una instantánea con nombres, identificadores, restricciones, cambios y fechas. Comunidad muestra **Banlist TCG** junto al ranking de Yu-Gi-Oh!: abre un diálogo interno con buscador, filtros y desplazamiento propio, también en móvil.

No usa IA ni descarga imágenes. Reutiliza consultas durante 5 minutos y nunca consulta la fuente por cada visita. El diálogo indica cuándo se consultó; no se presenta como una transmisión continua. Si Konami anuncia una lista futura, conserva la vigente y permite consultar la próxima, activándola en su fecha de entrada en vigor según Chile. Si la respuesta está incompleta o cambió de formato, conserva la última lista verificada. La instantánea tiene un endpoint público específico y no se incluye en la configuración general de la tienda.

Las noticias generales siguen pendientes del flujo de borradores en español. La estructura visual puede prepararse sin IA; la traducción y revisión editorial necesitan intervención del administrador. No hay un motor local instalado ni tarifas de traducción contratadas.

Noticias muestra publicaciones SERGOD a la izquierda y actualidad Yu-Gi-Oh! a la derecha; las columnas se apilan en móvil.

En Admin → Noticias → Actualidad Yu-Gi-Oh!, añade el enlace, fecha, título y resumen propio en español. Pulsa Añadir a la lista y Guardar selección de actualidad. Editar permite corregir textos; desmarcar Mostrar retira la tarjeta. La configuración conserva hasta 80 referencias, sin nuevas tablas; los elementos ocultos solo se entregan al admin.

## Beyond the Brave

La tarjeta del enlace https://www.yugiohmeta.com/articles/sets/tcg/betb ofrece Leer en español · Ver todas las cartas, hacia /noticias/beyond-the-brave, además del original. Tienda/Preventas y fichas de la familia Beyond abren la misma guía interna.

La guía tiene redacción propia, búsqueda por nombre español/inglés o código, filtro de rareza y 100 cartas distintas (BETB-EN001–100). Las variantes de rareza comparten ficha. El diálogo muestra imagen ampliada, nombre y texto español con enlace oficial Konami. Las imágenes conservan su idioma original. La lista no garantiza el contenido de un sobre ni mezcla extras de otros productos.

scripts/import-betb-gallery.mjs prepara manualmente la edición: consulta la API documentada de YGOPRODeck, guarda sus imágenes una vez, obtiene el texto español de cada ficha oficial y genera WebP de 600 px y miniaturas de 220 px. Conserva fuentes en .data/betb-import/, ignorado por Git; publica solo JSON y WebP en public/editions/betb/. Comprueba 100 cartas, textos y entidades antes de escribir el JSON final. Ejecutar node scripts/import-betb-gallery.mjs, revisar y desplegar. Para refrescar una fuente hay que retirar explícitamente su caché después de revisarla; no realiza consultas redundantes en cada ejecución.

El paquete completo pesa aproximadamente 12,6 MB decimales (12,0 MiB); miniaturas 1,8 MB. Se sirve estáticamente en Vercel, sin almacenamiento Supabase, funciones por carta, traducción de pago ni solicitudes de visitantes a proveedores. Las miniaturas usan carga diferida y la imagen grande solo aparece al abrir una ficha. El ancho de banda depende de las visitas: no es consumo cero.

Las demás noticias siguen como selección manual con resúmenes originales. No se copian artículos completos. Beyond the Brave conserva su guía estática revisada el 09-10-2026.

## Buscar nuevas ediciones

En Admin → Noticias → Guías de nuevas ediciones:

1. Pulsa **Buscar nuevas ediciones**. Consulta el catálogo gratuito documentado de YGOPRODeck; guarda la búsqueda 6 horas y muestra ediciones TCG recientes (últimos 180 días) y próximas anunciadas, hasta 60 resultados. Una edición ausente en la fuente no se inventa.
2. Selecciona la edición y pulsa **Preparar galería**. Procesa una carta por petición para respetar el tiempo de ejecución del servidor. Puedes pausar o cerrar el panel y reanudar después. El listado y el avance persisten en PostgreSQL.
3. Si la fuente no incluye el catálogo completo o Konami todavía no tiene un texto oficial español, se detiene con un aviso y conserva el avance. No usa traducción de pago ni publica efectos ingleses como españoles. Las imágenes originales pueden estar en inglés.
4. Revisa y edita el título, resumen y artículo propio en español. El texto inicial es una presentación original de la guía; no es una traducción de artículos de Meta ni un análisis generado por IA. Guarda el borrador y abre **Vista previa**.
5. Marca la revisión y pulsa **Publicar guía**. Aparece en la columna Yu-Gi-Oh! de Noticias y en los botones de productos cuyo grupo/nombre de catálogo coincide con la edición. No hay publicación automática. Un borrador posterior no modifica la instantánea pública hasta publicar cambios.

Las guías usan `/noticias/ediciones/{código}`. Se pueden retirar de Noticias conservando el borrador y las imágenes. Las referencias web manuales continúan funcionando; si se publica BETB con esta herramienta, evita duplicar su tarjeta en la columna.

### Recursos y almacenamiento

Las cartas se comparten por identificador entre ediciones y rarezas. Las 100 cartas estáticas de Beyond se reutilizan sin descargarlas. Para nuevas cartas se generan WebP de hasta 600 px y miniaturas de 220 px; se guardan en el depósito Supabase ya configurado (`SUPABASE_STORAGE_BUCKET`, por defecto `product-images`), bajo `editions/`. La API de YGOPRODeck solicita descargar y alojar las imágenes en lugar de hotlinking continuo.

El contador y límite de **100 MB adicionales** corresponden exclusivamente a esta herramienta, no al uso total de Supabase ni a su cuota de plan. Si se alcanza, deja de guardar nuevas cartas; no cambia de plan ni borra imágenes automáticamente. Las claves deterministas evitan duplicados al reintentar. En desarrollo usa `.data/objects/`. Visitantes consultan una guía completa, con caché pública de 60 segundos, y cargan miniaturas diferidas; la imagen grande se pide al abrir la carta. Hay consumo normal de base de datos, funciones, almacenamiento y transferencia, sin proveedor de IA de pago ni consultas por visitante a Konami/YGOPRODeck.

No hay cron ni monitoreo en segundo plano: una nueva caja se descubre al pulsar el botón después de que la fuente la incorpore. Sus textos oficiales españoles también deben estar disponibles. Se serializan búsquedas/importaciones para proteger el avance y el límite de almacenamiento. Las operaciones administrativas requieren sesión de administrador y origen de la tienda; los borradores no están disponibles en los endpoints públicos.
