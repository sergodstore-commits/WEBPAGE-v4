'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/client';
import { academyHouses, type DuelThresholds } from '@/lib/duel-academy';

export function DuelAcademySettings() {
  const [values, setValues] = useState<DuelThresholds | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setError('');
    try {
      setValues(await api<DuelThresholds>('/admin/league/academy'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los límites.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/admin/league/academy', { method: 'PATCH', body: JSON.stringify(values) });
      const saved = await api<DuelThresholds>('/admin/league/academy');
      const publicView = await api<{ academy: DuelThresholds }>('/rankings?board=yugioh');
      if (
        saved.ra_min !== values?.ra_min ||
        saved.obelisk_min !== values?.obelisk_min ||
        JSON.stringify(saved) !== JSON.stringify(publicView.academy)
      )
        throw Error(
          'Se guardaron los límites, pero no se pudo comprobar su lectura pública. Recarga para revisar.',
        );
      setValues(saved);
      setNotice('Límites guardados y comprobados en el ranking público.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los límites.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="admin-card" style={{ marginBottom: 24 }}>
      <summary>Academia de Duelos · Límites de puntos</summary>
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      {!values ? (
        <button className="admin-button secondary" onClick={() => void load()}>
          Cargar límites
        </button>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, marginTop: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
                gap: 16,
              }}
            >
              <label className="admin-field">
                Ra: puntos mínimos
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={values.ra_min}
                  onChange={(e) => {
                    setValues({ ...values, ra_min: Number(e.target.value) });
                    setNotice('');
                  }}
                />
              </label>
              <label className="admin-field">
                Obelisk: puntos mínimos
                <input
                  type="number"
                  min={values.ra_min + 1}
                  max={1000001}
                  step={1}
                  required
                  value={values.obelisk_min}
                  onChange={(e) => {
                    setValues({ ...values, obelisk_min: Number(e.target.value) });
                    setNotice('');
                  }}
                />
              </label>
            </div>
            {values.obelisk_min > values.ra_min && (
              <p>
                {academyHouses(values)
                  .map((h) => `${h.name}: ${h.range}`)
                  .join(' · ')}
              </p>
            )}
            <button className="admin-button" type="submit">
              {busy ? 'Guardando…' : 'Guardar límites'}
            </button>
          </fieldset>
          {notice && (
            <p role="status" className="admin-feedback">
              {notice}
            </p>
          )}
        </form>
      )}
    </details>
  );
}
