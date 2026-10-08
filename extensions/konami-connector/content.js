let reading = false;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !['SERGOD_READ_KONAMI', 'SERGOD_LIST_KONAMI'].includes(message?.type)
  )
    return;
  if (reading) {
    reply({ ok: false, error: 'Ya se están obteniendo los resultados. Espera a que termine.' });
    return;
  }
  reading = true;
  const read =
    message.type === 'SERGOD_LIST_KONAMI'
      ? readAllKonamiTournamentIds(document).then((ids) => ({ ok: true, ids }))
      : readKonamiReport(document, location.href).then((report) => ({ ok: true, report }));
  read
    .then(reply)
    .catch((error) => reply({ ok: false, error: error.message }))
    .finally(() => {
      reading = false;
    });
  return true;
});
