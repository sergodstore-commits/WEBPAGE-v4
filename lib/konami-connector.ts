export const KONAMI_CONNECTOR_ID = 'ihfaaopckpeaefkmcdpjajdihhgegmop';
export type KonamiReport = { title: string; played_on: string; event_id: string; text: string };
type ExtensionRuntime = {
  lastError?: { message?: string };
  sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void;
};
export function obtainKonamiReport(): Promise<KonamiReport> {
  const runtime = (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
  const install =
    'Instala el complemento SERGOD STORE en Brave, Chrome o Edge y abre allí la tienda y el torneo finalizado de Konami.';
  if (!runtime?.sendMessage) return Promise.reject(new Error(install));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Konami tardó demasiado. Revisa su pestaña y vuelve a intentarlo.')),
      60000,
    );
    runtime.sendMessage(KONAMI_CONNECTOR_ID, { type: 'SERGOD_KONAMI_RESULTS' }, (response) => {
      clearTimeout(timeout);
      if (runtime.lastError) {
        reject(new Error(install));
        return;
      }
      const result = response as { ok?: boolean; error?: string; report?: KonamiReport };
      if (!result?.ok || !result.report) {
        reject(new Error(result?.error || 'No se pudo obtener el torneo de Konami.'));
        return;
      }
      const report = result.report;
      if (
        typeof report.text !== 'string' ||
        report.text.length > 500000 ||
        typeof report.title !== 'string' ||
        typeof report.played_on !== 'string' ||
        typeof report.event_id !== 'string'
      ) {
        reject(new Error('El complemento devolvió un reporte inválido.'));
        return;
      }
      resolve(report);
    });
  });
}
