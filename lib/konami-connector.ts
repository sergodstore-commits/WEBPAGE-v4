export const KONAMI_CONNECTOR_ID = 'ihfaaopckpeaefkmcdpjajdihhgegmop';
export type KonamiReport = { title: string; played_on: string; event_id: string; text: string };
type ExtensionRuntime = {
  lastError?: { message?: string };
  sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void;
};
export function obtainKonamiReport(): Promise<{ reports: KonamiReport[]; errors: string[] }> {
  const runtime = (window as Window & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
  const install =
    'Actualiza o recarga el complemento SERGOD STORE en Brave, Chrome o Edge y abre allí la tienda y Konami con tu sesión iniciada.';
  if (!runtime?.sendMessage) return Promise.reject(new Error(install));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Konami tardó demasiado. Revisa su pestaña y vuelve a intentarlo.')),
      600000,
    );
    runtime.sendMessage(KONAMI_CONNECTOR_ID, { type: 'SERGOD_KONAMI_ALL_RESULTS' }, (response) => {
      clearTimeout(timeout);
      if (runtime.lastError) {
        reject(new Error(install));
        return;
      }
      const result = response as {
        ok?: boolean;
        error?: string;
        reports?: KonamiReport[];
        errors?: string[];
      };
      if (!result?.ok || !Array.isArray(result.reports)) {
        reject(
          new Error(
            result?.error === 'Solicitud no autorizada.'
              ? install
              : result?.error || 'No se pudieron obtener los torneos de Konami.',
          ),
        );
        return;
      }
      if (
        result.reports.length > 5000 ||
        !Array.isArray(result.errors) ||
        result.errors.some((e) => typeof e !== 'string')
      ) {
        reject(new Error('El complemento devolvió una lista inválida.'));
        return;
      }
      for (const report of result.reports) {
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
      }
      resolve({ reports: result.reports, errors: result.errors });
    });
  });
}
