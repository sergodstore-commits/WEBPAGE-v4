import { operationError } from './operation-errors.js';
import { shortIdentifier } from './presentation.js';

type Item = Readonly<Record<string, unknown>>;
const actions: Readonly<Record<string, string>> = {
  CATALOG_RESOURCE_OPERATION_FAILED: 'Carga de imagen fallida',
  CATALOG_RESOURCE_QUARANTINED: 'Imagen recibida para validación',
  CATALOG_RESOURCE_ACTIVATED: 'Imagen validada y guardada',
  CATALOG_RESOURCE_ASSOCIATED: 'Imagen asociada al producto',
  CATALOG_RESOURCE_REMOVED: 'Imagen retirada',
  CATALOG_PRODUCT_CREATED: 'Producto creado',
  CATALOG_PRODUCT_UPDATED: 'Producto editado',
  CATALOG_GAME_CREATED: 'Juego creado',
  CATALOG_CATEGORY_CREATED: 'Categoría creada',
  CATALOG_COLLECTION_CREATED: 'Colección creada',
  CATALOG_PUBLISHED: 'Elemento del catálogo publicado',
  CATALOG_UNPUBLISHED: 'Elemento del catálogo retirado',
  CATALOG_ARCHIVED: 'Elemento del catálogo archivado',
  ORDER_PAID: 'Pago de pedido confirmado',
  EDITORIAL_RESOURCE_ACTIVATED: 'Imagen editorial guardada',
  EDITORIAL_RESOURCE_ASSOCIATED: 'Imagen insertada en publicación',
};
const resources: Readonly<Record<string, string>> = {
  RESOURCE_ASSET: 'Imagen',
  PRODUCT: 'Producto',
  TCG_GAME: 'Juego',
  CATEGORY: 'Categoría',
  COLLECTION: 'Colección',
  EDITORIAL_ENTRY: 'Publicación',
  PREORDER_CAMPAIGN: 'Preventa',
  ORDER: 'Pedido',
  POS_SALE: 'Venta presencial',
  HOME_CAROUSEL_SLIDE: 'Banner',
};
function explanation(item: Item): string {
  const reason = String(item.reason ?? '');
  if (reason.includes('CATALOG_RESOURCE_')) {
    const code = reason.split(':').at(-1) ?? reason;
    return operationError(code, 'La carga no se completó.');
  }
  if (reason) return reason;
  if (item.action === 'CATALOG_RESOURCE_QUARANTINED')
    return 'Archivo recibido; todavía no está publicado. Revisa el resultado de validación posterior.';
  return item.result === 'FAILURE'
    ? 'No se completó la operación. El registro no incluye un motivo adicional.'
    : 'El servidor confirmó esta operación.';
}
export function AuditHistory({ items }: { readonly items: readonly Item[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Operación</th>
            <th>Elemento</th>
            <th>Resultado</th>
            <th>Explicación</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.auditEntryId ?? index)}>
              <td>
                {item.occurredAt
                  ? new Date(String(item.occurredAt)).toLocaleString('es-CL', {
                      timeZone: 'America/Santiago',
                    })
                  : 'Sin fecha'}
              </td>
              <td>
                {actions[String(item.action)] ?? 'Cambio administrativo'}
                <details>
                  <summary>Detalle técnico</summary>
                  <code>{String(item.action)}</code>
                  <br />
                  <span>{String(item.correlationId ?? '')}</span>
                </details>
              </td>
              <td>
                {resources[String(item.resourceType)] ?? 'Registro'}
                <br />
                {item.resourceId ? shortIdentifier(String(item.resourceId)) : 'Sin referencia'}
              </td>
              <td>
                {item.result === 'FAILURE'
                  ? 'Fallido'
                  : item.result === 'SUCCESS'
                    ? 'Confirmado'
                    : 'Sin resultado'}
              </td>
              <td>{explanation(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
