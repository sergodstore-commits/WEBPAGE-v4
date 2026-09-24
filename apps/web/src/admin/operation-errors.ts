const messages: Readonly<Record<string, string>> = {
  PREORDER_PUBLICATION_STATE_INVALID:
    'La campaña debe estar abierta o programada antes de publicarse.',
  PREORDER_OPEN_OUTSIDE_WINDOW:
    'La apertura y el cierre no incluyen la fecha actual. Revisa las fechas de la campaña.',
  PREORDER_SCHEDULED_OPEN_JOB_REQUIRED:
    'Esta preventa está programada. Se abrirá automáticamente en su fecha de apertura.',
  PREORDER_TRANSITION_INVALID: 'La campaña no admite ese cambio desde su estado actual.',
  PREORDER_PUBLICATION_TRANSITION_INVALID: 'La campaña ya tiene ese estado de publicación.',
  CATALOG_RESOURCE_MIME_MISMATCH:
    'El formato real de la imagen no coincide con el archivo. Guarda una copia como JPG, PNG o WebP e inténtalo de nuevo.',
  CATALOG_RESOURCE_EXTENSION_MISMATCH:
    'La extensión no corresponde a la imagen. Exporta una copia como JPG, PNG o WebP.',
  CATALOG_RESOURCE_FORMAT_UNSUPPORTED:
    'El archivo no es una imagen compatible o está incompleto. Usa JPG, PNG, WebP o AVIF.',
  CATALOG_RESOURCE_DECODE_FAILED: 'No se puede leer la imagen. Prueba a exportarla de nuevo.',
  CATALOG_RESOURCE_DIMENSIONS_OUT_OF_RANGE:
    'La imagen debe medir entre 320 y 8192 píxeles por lado.',
  CATALOG_RESOURCE_TOO_LARGE: 'La imagen supera 10 MB. Reduce su peso y vuelve a subirla.',
  CATALOG_STORAGE_NOT_CONFIGURED:
    'El almacenamiento de imágenes no está disponible. No se guardó el archivo.',
  CATALOG_PUBLICATION_REQUIREMENTS_NOT_MET:
    'Faltan requisitos para publicar: revisa la imagen principal y que el juego, categoría y colección estén publicados.',
  CATALOG_PUBLISHED_DESCENDANTS:
    'Hay productos publicados dentro de este elemento. Retíralos antes de retirar o archivar su categoría o juego.',
  CATALOG_PUBLICATION_TRANSITION_INVALID:
    'Este cambio no está permitido desde el estado actual. Actualiza la lista y revisa su estado.',
  PREORDER_PRODUCT_INVALID: 'Selecciona un producto de tipo Preventa.',
  INVENTORY_CONFIGURATION_REQUIRED:
    'Falta activar el umbral de inventario en la configuración del servidor. La operación no se guardó.',
  AUTHENTICATION_REQUIRED: 'La sesión terminó. Inicia sesión nuevamente para guardar.',
  FORBIDDEN: 'La cuenta no tiene permiso para esta operación.',
  IDEMPOTENCY_KEY_CONFLICT:
    'Esta solicitud ya se procesó con otros datos. Recarga la lista antes de reintentar.',
};

export function operationError(code: string, fallback: string): string {
  return messages[code] ?? fallback;
}
