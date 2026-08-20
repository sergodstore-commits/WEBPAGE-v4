import { type FormEvent, useEffect, useState } from 'react';

import { readCoverage, savePublicServiceInfo, transitionServiceInfo } from './api.js';

export function ServiceCoveragePanel() {
  const [data, setData] = useState<ReturnType<JSON['parse']>>({
    serviceInfo: [],
  });
  const [message, setMessage] = useState('');
  const refresh = async () => setData(await readCoverage());
  useEffect(() => {
    let active = true;
    void readCoverage()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : 'No fue posible cargar la cobertura.',
          );
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
            <input name="branchId" required />
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
          <button>Guardar información</button>
        </form>
        <form onSubmit={(event) => void run(event, 'TRANSITION')}>
          <h2>Publicar o retirar atención</h2>
          <label>
            Identificador
            <input name="resourceId" required />
          </label>
          <label>
            Estado
            <select name="nextState">
              <option>PUBLISHED</option>
              <option>WITHDRAWN</option>
            </select>
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button>Aplicar transición</button>
        </form>
      </div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <p className="status" role="status">
        {message}
      </p>
    </main>
  );
}
