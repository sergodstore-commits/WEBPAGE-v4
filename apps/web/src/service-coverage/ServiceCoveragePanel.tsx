import { type FormEvent, useEffect, useState } from 'react';

import { OperationalDataView } from '../admin/OperationalDataView.js';
import { readableText, shortIdentifier } from '../admin/presentation.js';
import { readCoverage, savePublicServiceInfo, transitionServiceInfo } from './api.js';

export function ServiceCoveragePanel() {
  const [data, setData] = useState<ReturnType<JSON['parse']>>({
    serviceInfo: [],
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const serviceInfo = itemsOf(data.serviceInfo);
  const branches = uniqueBranches(serviceInfo);
  const refresh = async () => setData(await readCoverage());
  useEffect(() => {
    let active = true;
    void readCoverage()
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : 'No fue posible cargar la cobertura.',
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (event: FormEvent<HTMLFormElement>, kind: 'INFO' | 'TRANSITION') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (kind === 'INFO') {
        await savePublicServiceInfo({
          branchId: String(form.get('branchId')),
          publicAddress: String(form.get('publicAddress')),
          openingHours: String(form.get('openingHours')),
          publicContacts: String(form.get('publicContacts')),
          directions: String(form.get('directions')).trim() || null,
          mapUrl: String(form.get('mapUrl')).trim() || null,
          reason: String(form.get('reason')).trim() || null,
        });
      } else {
        await transitionServiceInfo(
          String(form.get('resourceId')),
          String(form.get('nextState')),
          String(form.get('reason')),
        );
      }
      await refresh();
      setMessage('Cambio guardado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar el cambio.');
    }
  };

  return (
    <main className="wide-panel">
      <p className="eyebrow">Administración · Atención y cobertura</p>
      <h1>Atención pública, retiro y despacho</h1>
      <section className="technical-card">
        <h2>Despacho nacional</h2>
        <p>
          Cobertura en todo Chile hacia agencia CHILEXPRESS o STARKEN. El cliente paga el flete
          directamente al transportista.
        </p>
        <strong>NO INCLUIDO — ENVÍO POR PAGAR</strong>
      </section>
      <div className="pos-grid">
        <form onSubmit={(event) => void run(event, 'INFO')}>
          <h2>Atención pública</h2>
          <label>
            Sucursal
            <select disabled={branches.length === 0} name="branchId" required>
              <option value="">
                {loading
                  ? 'Cargando sucursal…'
                  : branches.length === 0
                    ? 'No hay sucursal configurada'
                    : 'Selecciona una sucursal'}
              </option>
              {branches.map((branch) => (
                <option key={String(branch.branch_id)} value={String(branch.branch_id)}>
                  {branchLabel(branch)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dirección pública
            <input name="publicAddress" required />
          </label>
          <label>
            Horario
            <input name="openingHours" required />
          </label>
          <label>
            Contacto público
            <input name="publicContacts" required />
          </label>
          <label>
            Indicaciones
            <input name="directions" />
          </label>
          <label>
            Mapa HTTPS
            <input name="mapUrl" type="url" />
          </label>
          <label>
            Motivo de edición
            <input name="reason" />
          </label>
          <button disabled={branches.length === 0}>Guardar información</button>
        </form>
        <form onSubmit={(event) => void run(event, 'TRANSITION')}>
          <h2>Publicar o retirar atención</h2>
          <label>
            Información de atención
            <select disabled={serviceInfo.length === 0} name="resourceId" required>
              <option value="">
                {loading
                  ? 'Cargando información…'
                  : serviceInfo.length === 0
                    ? 'No hay información guardada'
                    : 'Selecciona'}
              </option>
              {serviceInfo.map((item) => (
                <option
                  key={String(item.public_service_info_id)}
                  value={String(item.public_service_info_id)}
                >
                  {branchLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select name="nextState">
              <option value="PUBLISHED">Publicado</option>
              <option value="WITHDRAWN">Retirado</option>
            </select>
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button disabled={serviceInfo.length === 0}>Aplicar transición</button>
        </form>
      </div>
      <OperationalDataView
        data={data.serviceInfo}
        emptyMessage="Aún no hay información pública de atención guardada."
        title="Información de atención configurada"
      />
      <p className="status" role="status">
        {message}
      </p>
    </main>
  );
}

type Item = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function itemsOf(value: unknown): readonly Item[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function uniqueBranches(items: readonly Item[]): readonly Item[] {
  return items.filter(
    (item, index) =>
      typeof item.branch_id === 'string' &&
      items.findIndex((candidate) => candidate.branch_id === item.branch_id) === index,
  );
}

function branchLabel(item: Item): string {
  if (typeof item.public_address === 'string' && item.public_address.trim() !== '')
    return readableText(item.public_address);
  return `Sucursal ${shortIdentifier(String(item.branch_id ?? 'sin referencia'))}`;
}
