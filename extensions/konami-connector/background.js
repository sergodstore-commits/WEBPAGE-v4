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
  (message?.type === 'SERGOD_KONAMI_ALL_RESULTS'
    ? obtainAll(message, sender)
    : obtain(message, sender)
  )
    .then(reply)
    .catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
let collecting = false;
async function obtainAll(message, sender) {
  if (!allowedSender(sender)) throw Error('Solicitud no autorizada.');
  if (collecting) throw Error('Ya se están buscando torneos de Konami. Espera a que termine.');
  collecting = true;
  let tab;
  try {
    const tabs = (
      await chrome.tabs.query({ url: 'https://shp.cardgame-network.konami.net/mt/home/*' })
    ).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    tab = tabs[0];
    if (!tab) throw Error('Abre Konami e inicia sesión en este mismo navegador.');
    async function request(type, expectedId) {
      const until = Date.now() + 20000;
      let last;
      while (Date.now() < until) {
        try {
          const result = await chrome.tabs.sendMessage(tab.id, { type });
          if (result?.ok && (!expectedId || result.report?.event_id === expectedId)) return result;
          last = result?.error;
        } catch {
          last = 'Recarga Konami después de actualizar el complemento.';
        }
        const current = await chrome.tabs.get(tab.id);
        if (!current.url?.startsWith('https://shp.cardgame-network.konami.net/mt/home/'))
          throw Error('La sesión de Konami venció. Inicia sesión y vuelve a actualizar.');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw Error(last || 'Konami no terminó de cargar.');
    }
    await chrome.tabs.update(tab.id, {
      url: 'https://shp.cardgame-network.konami.net/mt/home/#/tournament',
    });
    const { ids } = await request('SERGOD_LIST_KONAMI'),
      reports = [],
      errors = [];
    for (const id of ids) {
      try {
        await chrome.tabs.update(tab.id, {
          url: `https://shp.cardgame-network.konami.net/mt/home/#/tournament-finish/${encodeURIComponent(id)}`,
        });
        const result = await request('SERGOD_READ_KONAMI', id);
        if (result.report.event_id !== id) throw Error('Konami no terminó de cargar este torneo.');
        reports.push(result.report);
      } catch (e) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    return { ok: true, reports, errors };
  } finally {
    collecting = false;
    if (tab) await chrome.tabs.update(tab.id, { url: tab.url }).catch(() => {});
  }
}
