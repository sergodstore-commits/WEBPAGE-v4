'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import {
  newsArticle,
  mylArticle,
  newsBoards,
  type MylNewsBoard,
  webNewsCategories,
  type WebNewsItem,
  type WebNewsCandidate,
} from '@/lib/web-news';
import styles from './NewsWorkspace.module.css';

const blank = (): WebNewsItem => ({
  id: '',
  title: '',
  summary: '',
  url: '',
  published_on: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  visible: false,
  category: 'news',
  body: '',
});

export function WebNewsAdmin() {
  const [items, setItems] = useState<WebNewsItem[] | null>(null);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [translate, setTranslate] = useState(true);
  const [filter, setFilter] = useState('all');
  const [candidates, setCandidates] = useState<WebNewsCandidate[]>([]);
  const [progress, setProgress] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [publishedItem, setPublishedItem] = useState<WebNewsItem | null>(null);
  const stop = useRef(false);
  const editor = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || notice) feedback.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [error, notice]);
  useEffect(() => {
    if (draft.id) editor.current?.scrollIntoView({ block: 'start' });
  }, [draft.id]);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  async function review(source: 'tcg' | 'myl' = 'tcg') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ items: WebNewsCandidate[] }>(
        `/admin/news/web-sources/${source === 'myl' ? 'review-myl' : 'review'}`,
        {
          method: 'POST',
          body: '{}',
        },
      );
      setCandidates(result.items);
      setNotice(
        `${result.items.length} noticias ${source === 'myl' ? 'MyL' : 'TCG'} disponibles. Preparar una noticia no la publica.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos consultar la fuente.');
    } finally {
      setBusy(false);
    }
  }
  async function prepareImages(id: string) {
    setBusy(true);
    setError('');
    stop.current = false;
    type Result = {
      items: WebNewsItem[];
      ready: number;
      total: number;
      storage_bytes: number;
      storage_limit: number;
    };
    try {
      let result = await api<Result>(`/admin/news/web-sources/${id}/prepare`, {
        method: 'POST',
        body: '{}',
      });
      setItems(result.items);
      setProgress(
        `Imágenes: ${result.ready} de ${result.total} · ${(result.storage_bytes / 1_000_000).toFixed(1)} de 15 MB`,
      );
      while (result.ready < result.total && !stop.current) {
        const previous = result.ready;
        result = await api<Result>(`/admin/news/web-sources/${id}/images`, {
          method: 'POST',
          body: '{}',
        });
        setItems(result.items);
        if (result.ready <= previous && result.ready < result.total)
          throw Error('La preparación no avanzó. El borrador se conserva; vuelve a intentar.');
        setProgress(
          `Imágenes: ${result.ready} de ${result.total} · ${(result.storage_bytes / 1_000_000).toFixed(1)} de 15 MB`,
        );
      }
      setNotice(
        stop.current
          ? 'Preparación pausada. Puedes reanudar con el mismo botón.'
          : 'Borrador e imágenes guardados. Revisa el español y pulsa Publicar noticia.',
      );
      return result.items;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos preparar las imágenes.');
      throw e;
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  async function load() {
    try {
      setItems(await api<WebNewsItem[]>('/admin/news/web-sources'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar las noticias web.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function persist(item: WebNewsItem) {
    const saved = await api<WebNewsItem[]>(`/admin/news/web-sources/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify(item),
    });
    setItems(saved);
    const verified = await api<WebNewsItem[]>('/admin/news/web-sources');
    const stored = verified.find((v) => v.id === item.id);
    if (!stored || stored.visible !== item.visible || stored.title !== item.title)
      throw Error('No pudimos comprobar el guardado. Recarga antes de reintentar.');
    if (item.visible) {
      const publicItems = await api<WebNewsItem[]>('/news/web-sources');
      if (!publicItems.some((v) => v.id === item.id))
        throw Error(
          'La noticia se guardó, pero no aparece en el listado público. Revisa su guía de edición.',
        );
    }
    return saved;
  }
  function editCandidate(candidate: WebNewsCandidate) {
    setDraft({
      ...blank(),
      id: candidate.id,
      url: candidate.url,
      published_on: candidate.published_on,
      category: candidate.category,
      boards: candidate.boards || ['yugioh'],
      source_image: candidate.source_image,
      original_title: candidate.title,
      original_summary: candidate.summary,
      ...(candidate.boards?.some((b) => b !== 'yugioh')
        ? { title: candidate.title, summary: candidate.summary, body: candidate.summary }
        : {}),
    });
    editor.current?.scrollIntoView({ block: 'center' });
  }
  async function prepareCandidate(candidate: WebNewsCandidate) {
    setBusy(true);
    setError('');
    setNotice('');
    let savedDraft: WebNewsItem | undefined;
    try {
      const saved = await api<WebNewsItem[]>('/admin/news/web-sources/draft', {
        method: 'POST',
        body: JSON.stringify({
          id: candidate.id,
          source: candidate.boards?.some((b) => b !== 'yugioh') ? 'myl' : 'tcg',
          translate,
        }),
      });
      setItems(saved);
      savedDraft = saved.find((item) => item.id === candidate.id);
      const prepared = await prepareImages(candidate.id);
      setDraft({ ...(prepared || saved).find((i) => i.id === candidate.id)! });
      editor.current?.scrollIntoView({ block: 'center' });
    } catch (e) {
      if (savedDraft) setDraft({ ...savedDraft });
      else editCandidate(candidate);
      setError(e instanceof Error ? e.message : 'No pudimos preparar la noticia.');
    } finally {
      setBusy(false);
    }
  }
  async function publish(item: WebNewsItem) {
    setBusy(true);
    setWorkingId(item.id);
    setPublishedItem(null);
    setError('');
    setNotice('');
    try {
      let ready = item;
      if (
        !item.visible &&
        ((item.original_title && !item.media_checked) || item.media?.some((m) => !m.image))
      ) {
        const prepared = await prepareImages(item.id);
        if (stop.current) return false;
        ready = prepared!.find((i) => i.id === item.id)!;
      }
      setBusy(true);
      await persist({ ...ready, visible: !item.visible });
      if (!item.visible) setPublishedItem(ready);
      setNotice(
        item.visible
          ? 'Noticia retirada. El borrador y sus imágenes se conservan.'
          : 'Noticia publicada. Guardado y aparición en Noticias comprobados.',
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      return false;
    } finally {
      setBusy(false);
      setWorkingId('');
    }
  }
  function articlePath(item: WebNewsItem) {
    return item.id === 'beyond-the-brave'
      ? '/noticias/beyond-the-brave'
      : `/noticias/${mylArticle(item.url) ? 'myl' : 'tcg'}/${item.id}`;
  }
  return (
    <>
      <section className="admin-card admin-card-body" aria-labelledby="web-news-admin-heading">
        <h2 id="web-news-admin-heading">Actualidad Yu-Gi-Oh! y MyL</h2>
        <p>
          Yu-Gi-Oh! solo TCG; MyL Primera Era, Primer Bloque y banlist. Busca novedades y decide qué
          aparece en Noticias. Cada noticia se guarda por separado.
        </p>
        <div className={styles.workflow}>
          <strong>1. Buscar → 2. Preparar y revisar → 3. Publicar noticia</strong>
          <p>
            Preparar guarda una nota breve con el título y resumen de la fuente y descarga sus
            imágenes. No publica nada.
          </p>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={translate}
              disabled={busy}
              onChange={(e) => setTranslate(e.target.checked)}
            />{' '}
            Traducir notas TCG al español al preparar
          </label>
          <small>
            {' '}
            MyMemory gratuito: cuota externa de 5.000 caracteres/día, compartida por la conexión del
            servidor. Solo se envían título y resumen públicos. Revisa nombres y traducción; no
            traduce efectos oficiales ni redacta artículos completos. MyL ya viene en español.
          </small>
        </div>
        <p>
          <button className="admin-button" disabled={busy} onClick={() => void review()}>
            Buscar novedades TCG
          </button>{' '}
          <button className="admin-button" disabled={busy} onClick={() => void review('myl')}>
            Buscar novedades MyL
          </button>{' '}
          <a
            href="https://www.yugiohmeta.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-button secondary"
          >
            Consultar Yu-Gi-Oh! Meta ↗
          </a>
        </p>
        {progress && (
          <p role="status">
            {progress}{' '}
            <button
              type="button"
              className="admin-button secondary"
              onClick={() => {
                stop.current = true;
              }}
            >
              Pausar preparación
            </button>
          </p>
        )}
        {candidates.length > 0 && (
          <section
            aria-label={`Noticias ${candidates.some((c) => c.boards?.some((b) => b !== 'yugioh')) ? 'MyL' : 'TCG'} disponibles`}
            className="admin-table-scroll"
            style={{ maxHeight: 460, overflow: 'auto' }}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fuente · novedades</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.title}</strong>
                      <p>
                        {(candidate.boards || ['yugioh']).map((b) => newsBoards[b]).join(' / ')} ·{' '}
                        {webNewsCategories[candidate.category]} · {candidate.published_on}
                      </p>
                      <a href={candidate.url} target="_blank" rel="noopener noreferrer">
                        Consultar original ↗
                      </a>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-button secondary"
                        disabled={busy || Boolean(items?.some((i) => i.url === candidate.url))}
                        onClick={() => void prepareCandidate(candidate)}
                      >
                        {items?.some((i) => i.url === candidate.url)
                          ? 'Ya está en la lista'
                          : 'Preparar noticia'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div ref={feedback} className={styles.feedback}>
          {busy && (
            <p role="status" className="admin-feedback">
              {progress || 'Procesando noticia. Espera la confirmación antes de volver a pulsar.'}
            </p>
          )}
          {error && (
            <p role="alert" className="admin-feedback error">
              {error}{' '}
              {!items && (
                <button className="admin-button secondary" onClick={() => void load()}>
                  Reintentar
                </button>
              )}
            </p>
          )}
          {notice && (
            <p role="status" className="admin-feedback success">
              {notice}
              {publishedItem && (
                <>
                  {' '}
                  <a href={articlePath(publishedItem)} target="_blank" rel="noopener noreferrer">
                    Ver noticia publicada ↗
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        {items === null ? (
          <p>Cargando selección…</p>
        ) : (
          <>
            <details open={Boolean(draft.id)} className={styles.editor}>
              <summary>
                {draft.id ? 'Revisar noticia seleccionada' : 'Crear una noticia manualmente'}
              </summary>
              <form
                id="web-news-editor"
                ref={editor}
                onInvalidCapture={(event) => {
                  const field = event.target as HTMLInputElement;
                  const label = field.labels?.[0]?.textContent?.trim() || 'Un campo';
                  setNotice('');
                  setError(`${label}: ${field.validationMessage}`);
                }}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const publishing =
                    (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
                    'publish';
                  const url = newsArticle(draft.url);
                  if (!url) {
                    setError('Usa un artículo de Yu-Gi-Oh! Meta o del blog oficial MyL.');
                    return;
                  }
                  if (items.some((item) => item.url === url && item.id !== draft.id)) {
                    setError('Ese artículo ya está en la lista.');
                    return;
                  }
                  setBusy(true);
                  setWorkingId(draft.id);
                  setPublishedItem(null);
                  setError('');
                  setNotice('');
                  try {
                    const item = {
                      ...draft,
                      url,
                      title: draft.title.trim(),
                      summary: draft.summary.trim(),
                      id: draft.id || crypto.randomUUID(),
                    };
                    const saved = await persist(item);
                    if (publishing) {
                      const stored = saved.find((v) => v.id === item.id)!;
                      setDraft((await publish(stored)) ? blank() : stored);
                      return;
                    }
                    setDraft(blank());
                    setNotice(
                      'Noticia guardada y lectura comprobada. Los borradores aún no aparecen en la web.',
                    );
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo guardar.');
                  } finally {
                    setBusy(false);
                    setWorkingId('');
                  }
                }}
              >
                <fieldset
                  disabled={busy}
                  style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}
                >
                  {draft.original_title && (
                    <details open>
                      <summary>Referencia original · revisa tu versión en español</summary>
                      <p>
                        <strong>{draft.original_title}</strong>
                      </p>
                      <p>{draft.original_summary}</p>
                      <a href={draft.url} target="_blank" rel="noopener noreferrer">
                        Abrir artículo original ↗
                      </a>
                    </details>
                  )}
                  <label className="admin-field">
                    <span>Enlace del artículo</span>
                    <input
                      required
                      type="url"
                      maxLength={1000}
                      value={draft.url}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          url: e.target.value,
                          boards: mylArticle(e.target.value) ? ['myl-first-era'] : ['yugioh'],
                        })
                      }
                      placeholder="https://www.yugiohmeta.com/articles/…"
                    />
                  </label>
                  <label className="admin-field">
                    <span>Categoría de la noticia</span>
                    <select
                      value={draft.category || 'news'}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value as WebNewsItem['category'] })
                      }
                    >
                      {Object.entries(webNewsCategories).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mylArticle(draft.url) && (
                    <fieldset style={{ border: '1px solid #365464', borderRadius: 8, padding: 12 }}>
                      <legend>Mostrar en los formatos seleccionados</legend>
                      {(['myl-first-era', 'myl-first-block'] as const).map((board) => (
                        <label className="admin-check" key={board}>
                          <input
                            type="checkbox"
                            checked={draft.boards?.includes(board) || false}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                boards: e.target.checked
                                  ? [...(draft.boards || []), board]
                                  : (draft.boards || []).filter((b) => b !== board),
                                effective_dates: Object.fromEntries(
                                  Object.entries(draft.effective_dates || {}).filter(
                                    ([key]) => e.target.checked || key !== board,
                                  ),
                                ),
                              })
                            }
                          />{' '}
                          {newsBoards[board]}
                        </label>
                      ))}
                      <p className="admin-help">
                        Revisa el formato: algunas categorías del blog incluyen otros juegos
                        organizados.
                      </p>
                    </fieldset>
                  )}
                  {mylArticle(draft.url) && draft.category === 'banlist' && (
                    <fieldset style={{ border: '1px solid #365464', borderRadius: 8, padding: 12 }}>
                      <legend>Vigencia por formato (opcional)</legend>
                      {(draft.boards || [])
                        .filter((b): b is MylNewsBoard => b !== 'yugioh')
                        .map((board) => (
                          <label className="admin-field" key={board}>
                            <span>{newsBoards[board]} · vigente desde</span>
                            <input
                              type="date"
                              value={draft.effective_dates?.[board] || ''}
                              onChange={(e) => {
                                const dates = { ...draft.effective_dates };
                                if (e.target.value) dates[board] = e.target.value;
                                else delete dates[board];
                                setDraft({ ...draft, effective_dates: dates });
                              }}
                            />
                          </label>
                        ))}
                      <p className="admin-help">
                        Confirma estas fechas en el aviso oficial. No son la fecha de publicación ni
                        una lista completa de cartas restringidas.
                      </p>
                    </fieldset>
                  )}
                  <label className="admin-field">
                    <span>Artículo en español</span>
                    <textarea
                      rows={7}
                      maxLength={12000}
                      value={draft.body || ''}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      placeholder="Redacta los detalles de la noticia. Separa los párrafos con una línea en blanco."
                    />
                  </label>
                  {draft.media?.length ? (
                    <details>
                      <summary>Textos de las imágenes y cartas ({draft.media.length})</summary>
                      {draft.media.map((m, index) => (
                        <label className="admin-field" key={m.source}>
                          <span>{m.name} · texto o efecto en español (opcional)</span>
                          <textarea
                            rows={3}
                            maxLength={3000}
                            value={m.caption || ''}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                media: draft.media!.map((old, i) =>
                                  i === index ? { ...old, caption: e.target.value } : old,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                    </details>
                  ) : null}
                  <label className="admin-field">
                    <span>Título en español</span>
                    <input
                      name="spanish-title"
                      required
                      minLength={3}
                      maxLength={160}
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Resumen propio en español</span>
                    <textarea
                      required
                      minLength={10}
                      maxLength={600}
                      rows={3}
                      value={draft.summary}
                      onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Fecha del artículo</span>
                    <input
                      required
                      type="date"
                      value={draft.published_on}
                      onChange={(e) => setDraft({ ...draft, published_on: e.target.value })}
                    />
                  </label>
                  {draft.title && (
                    <details open className={styles.workflow}>
                      <summary>Vista previa del texto</summary>
                      <h3>{draft.title}</h3>
                      <p>{draft.summary}</p>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{draft.body}</p>
                      <small>
                        El artículo público también incluirá las imágenes preparadas y la atribución
                        de la fuente.
                      </small>
                    </details>
                  )}
                  <div className="admin-actions">
                    {!draft.visible && (
                      <button
                        className="admin-button"
                        type="submit"
                        value="publish"
                        disabled={!draft.id && items.length >= 80}
                      >
                        {busy ? 'Procesando noticia…' : 'Publicar noticia revisada'}
                      </button>
                    )}
                    <button
                      className="admin-button secondary"
                      disabled={!draft.id && items.length >= 80}
                    >
                      {items.some((old) => old.id === draft.id)
                        ? 'Guardar cambios de la noticia'
                        : 'Guardar borrador'}
                    </button>
                    {draft.id && (
                      <button
                        type="button"
                        className="admin-button secondary"
                        onClick={() => setDraft(blank())}
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
            </details>
            <div className="admin-actions" style={{ marginTop: 20 }}>
              <label className="admin-field">
                <span>Ver noticias guardadas</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">Todas ({items.length})</option>
                  <option value="draft">
                    Borradores ({items.filter((i) => !i.visible).length})
                  </option>
                  <option value="published">
                    Publicadas ({items.filter((i) => i.visible).length})
                  </option>
                </select>
              </label>
            </div>
            <div className="admin-table-scroll" style={{ marginTop: 20 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Noticia</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter((item) => filter === 'all' || item.visible === (filter === 'published'))
                    .sort((a, b) => b.published_on.localeCompare(a.published_on))
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className={styles.status}>
                            {item.visible ? 'Publicada' : 'Borrador'}
                          </span>
                          <button
                            type={draft.id === item.id && !item.visible ? 'submit' : 'button'}
                            form={
                              draft.id === item.id && !item.visible ? 'web-news-editor' : undefined
                            }
                            value="publish"
                            className="admin-button"
                            disabled={busy || (draft.id === item.id && item.visible)}
                            onClick={
                              draft.id === item.id && !item.visible
                                ? undefined
                                : () => void publish(item)
                            }
                          >
                            {busy && workingId === item.id
                              ? 'Procesando noticia…'
                              : item.visible
                                ? 'Retirar noticia'
                                : 'Publicar noticia'}
                          </button>
                          {item.visible && (
                            <a href={articlePath(item)} target="_blank" rel="noopener noreferrer">
                              Ver publicada ↗
                            </a>
                          )}
                        </td>
                        <td>
                          <strong>{item.title}</strong>
                          <p>{item.summary}</p>
                          <small>
                            {(item.boards || ['yugioh']).map((b) => newsBoards[b]).join(' / ')} ·{' '}
                            {webNewsCategories[item.category || 'news']} ·{' '}
                            {item.media_checked
                              ? `${item.media?.filter((m) => m.image).length || 0}/${item.media?.length || 0} imágenes listas`
                              : 'Imágenes sin preparar'}
                          </small>
                          <a href={item.url} target="_blank" rel="noopener noreferrer">
                            Ver fuente ↗
                          </a>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-button secondary"
                            disabled={busy || draft.id === item.id}
                            onClick={() => void prepareImages(item.id).catch(() => {})}
                          >
                            {item.media_checked ? 'Actualizar imágenes' : 'Preparar imágenes'}
                          </button>{' '}
                          <button
                            className="admin-button secondary"
                            disabled={busy}
                            onClick={() => {
                              setDraft({ ...item });
                              editor.current?.scrollIntoView({ block: 'center' });
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!items.length && <p>No hay artículos seleccionados.</p>}
            <p className="admin-muted">
              Preparar y guardar conserva un borrador. Publicar noticia comprueba que aparece en la
              web. Imágenes WebP: presupuesto compartido de 15 MB y máximo 160 KB por archivo.
            </p>
          </>
        )}
      </section>
    </>
  );
}
