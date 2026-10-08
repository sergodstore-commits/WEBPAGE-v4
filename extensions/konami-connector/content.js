let reading = false;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'SERGOD_READ_KONAMI') return;
  if (reading) {
    reply({ ok: false, error: 'Ya se están obteniendo los resultados. Espera a que termine.' });
    return;
  }
  reading = true;
  readKonamiReport(document, location.href)
    .then((report) => reply({ ok: true, report }))
    .catch((error) => reply({ ok: false, error: error.message }))
    .finally(() => {
      reading = false;
    });
  return true;
});
