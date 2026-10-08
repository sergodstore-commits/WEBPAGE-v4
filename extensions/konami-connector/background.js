function allowedSender(sender) {
  try {
    const url = new URL(sender.url);
    return (
      url.origin === 'https://www.sergodstore.cl' &&
      url.pathname === '/admin/liga' &&
      sender.frameId === 0
    );
  } catch {
    return false;
  }
}
async function obtain(message, sender) {
  if (!allowedSender(sender) || message?.type !== 'SERGOD_KONAMI_RESULTS')
    throw Error('Solicitud no autorizada.');
  const tabs = (
    await chrome.tabs.query({ url: 'https://shp.cardgame-network.konami.net/mt/home/*' })
  )
    .filter((tab) =>
      /^https:\/\/shp\.cardgame-network\.konami\.net\/mt\/home\/#\/tournament-finish\/[a-zA-Z0-9_.:-]+$/.test(
        tab.url || '',
      ),
    )
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (!tabs.length)
    throw Error(
      'Abre en este mismo navegador el torneo finalizado de Konami e inicia sesión allí.',
    );
  const result = await chrome.tabs.sendMessage(tabs[0].id, { type: 'SERGOD_READ_KONAMI' });
  if (!result?.ok)
    throw Error(result?.error || 'Recarga la pestaña de Konami y vuelve a obtener los resultados.');
  return result;
}
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  obtain(message, sender)
    .then(reply)
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
