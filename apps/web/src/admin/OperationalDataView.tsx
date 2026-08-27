import { operationalValue, readableText, shortIdentifier } from './presentation.js';

const fieldLabels: Readonly<Record<string, string>> = {
  agencyDestination: 'Agencia de destino',
  amount_clp: 'Monto',
  branch_id: 'Sucursal',
  buyer_email: 'Correo del comprador',
  buyer_name: 'Comprador',
  buyer_phone: 'Teléfono del comprador',
  carrier: 'Transportista',
  code: 'Código',
  completed_at: 'Completada el',
  created_at: 'Creada el',
  date: 'Fecha',
  destinationCommune: 'Comuna de destino',
  directions: 'Indicaciones',
  external_reference: 'Referencia externa',
  gross_amount_clp: 'Total bruto',
  item: 'Venta',
  lines: 'Productos',
  name: 'Nombre',
  net_amount_clp: 'Total neto',
  opening_hours: 'Horario',
  pos_sale_id: 'Código de venta',
  price_amount_clp: 'Precio',
  public_address: 'Dirección pública',
  public_contacts: 'Contacto público',
  public_service_info_id: 'Código interno',
  sale_count: 'Ventas completadas',
  sale_type: 'Tipo de venta',
  shippingIncludedInOrderTotal: 'Envío incluido en el total',
  shippingLabel: 'Condición del envío',
  sku: 'SKU',
  settlements: 'Pagos registrados',
  state: 'Estado',
  status: 'Estado',
  subtotal_amount_clp: 'Subtotal',
  total_amount_clp: 'Total',
};

const hiddenFields = new Set([
  'acceptance_run_id',
  'correlation_id',
  'hasMore',
  'nextCursor',
  'snapshot_contract',
  'snapshot_schema_version',
  'version',
]);

export function OperationalDataView({
  data,
  emptyMessage = 'No hay registros para mostrar.',
  title,
}: {
  readonly data: unknown;
  readonly emptyMessage?: string;
  readonly title: string;
}) {
  if (isEmpty(data)) return <p className="status">{emptyMessage}</p>;
  return (
    <section className="operational-results" aria-label={title}>
      <h2>{title}</h2>
      <OperationalValue data={data} depth={0} />
    </section>
  );
}

function OperationalValue({ data, depth }: { readonly data: unknown; readonly depth: number }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="status">No hay registros.</p>;
    return (
      <div className="operational-result-grid">
        {data.map((item, index) => (
          <article className="operational-result-card" key={recordKey(item, index)}>
            <OperationalValue data={item} depth={depth + 1} />
          </article>
        ))}
      </div>
    );
  }
  if (isRecord(data)) {
    const entries = Object.entries(data).filter(
      ([key, value]) => !hiddenFields.has(key) && value !== null && value !== undefined,
    );
    if (entries.length === 0) return <p className="status">Sin información adicional.</p>;
    return (
      <dl className="facts operational-facts">
        {entries.map(([key, value]) => (
          <div className="operational-fact" key={key}>
            <dt>{fieldLabel(key)}</dt>
            <dd>
              {typeof value === 'object' ? (
                <OperationalValue data={value} depth={depth + 1} />
              ) : (
                displayValue(key, value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{displayValue('', data)}</span>;
}

function displayValue(key: string, value: unknown) {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number' && key.toLowerCase().includes('amount_clp'))
    return value.toLocaleString('es-CL', { currency: 'CLP', style: 'currency' });
  const text = readableText(String(value));
  if (key.toLowerCase().endsWith('_id') || key.toLowerCase().endsWith('id'))
    return <span title={text}>{shortIdentifier(text)}</span>;
  if (key.endsWith('_at') && !Number.isNaN(Date.parse(text)))
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(text),
    );
  return operationalValue(text);
}

function fieldLabel(key: string): string {
  const known = fieldLabels[key];
  if (known) return known;
  const words = key
    .replace(/_/gu, ' ')
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .toLocaleLowerCase('es-CL');
  return `${words.charAt(0).toLocaleUpperCase('es-CL')}${words.slice(1)}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (!isRecord(value)) return false;
  const visibleEntries = Object.entries(value).filter(([key]) => !hiddenFields.has(key));
  return visibleEntries.length === 0 || visibleEntries.every(([, item]) => isEmpty(item));
}

function recordKey(value: unknown, index: number): string | number {
  if (!isRecord(value)) return index;
  for (const [key, item] of Object.entries(value))
    if ((key.endsWith('_id') || key.endsWith('Id')) && typeof item === 'string') return item;
  return index;
}
