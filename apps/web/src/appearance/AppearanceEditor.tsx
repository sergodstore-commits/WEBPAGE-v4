import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  siteAppearanceLayoutSchema,
  type SiteAppearanceAssetId,
  type SiteAppearanceElement,
  type SiteAppearanceLayout,
  type SiteAppearanceLayer,
  type SiteAppearancePageId,
} from '@sergod/contracts';

import { authorizedRequest, publicRequest } from '../identity/api.js';
import {
  appearanceAssetIds,
  appearanceAssetCategory,
  appearanceAssetLabel,
  appearanceAssets,
  appearanceElementLabels,
  defaultAppearanceLayout,
  defaultAppearanceElements,
  hydrateAppearanceLayout,
  layerStyle,
  linkedAppearanceElements,
} from './appearance-model.js';
import {
  appearancePreviewMessageType,
  appearancePreviewReadyType,
} from './appearance-preview-context.js';

const pageLabels: Readonly<Record<SiteAppearancePageId, string>> = {
  comics: 'Cómics',
  community: 'Comunidad',
  home: 'Portada',
  news: 'Noticias',
  shop: 'Tienda',
  tournaments: 'Torneos',
};

const pageIds: readonly SiteAppearancePageId[] = [
  'home',
  'shop',
  'tournaments',
  'news',
  'community',
  'comics',
];

const previewPaths: Readonly<Record<SiteAppearancePageId, string>> = {
  comics: '/comics',
  community: '/community',
  home: '/',
  news: '/news',
  shop: '/shop',
  tournaments: '/tournaments',
};

const groupedAppearanceAssets = appearanceAssetIds.reduce<Record<string, SiteAppearanceAssetId[]>>(
  (groups, assetId) => {
    const category = appearanceAssetCategory(assetId);
    (groups[category] ??= []).push(assetId);
    return groups;
  },
  {},
);

export function AppearanceEditor() {
  const [layout, setLayout] = useState<SiteAppearanceLayout>(defaultAppearanceLayout);
  const [page, setPage] = useState<SiteAppearancePageId>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [message, setMessage] = useState('Cargando apariencia publicada…');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  const [assetCategory, setAssetCategory] = useState('Destacados');
  const [libraryCategory, setLibraryCategory] = useState('Destacados');
  const [assetSearch, setAssetSearch] = useState('');
  const [toolPanel, setToolPanel] = useState<'LIBRARY' | 'PROPERTIES'>('LIBRARY');
  const busy = useRef(false);
  const pendingPublish = useRef<{
    value: string;
    createKey: string;
    activateKey: string;
    versionId?: string;
  } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const layers = layout[page].layers;
  const elements = layout[page].elements ?? [];
  const selected = useMemo(
    () => layers.find(({ id }) => id === selectedId) ?? null,
    [layers, selectedId],
  );
  const selectedElement = elements.find(({ id }) => id === selectedElementId) ?? null;
  const selectedLinkedElement = selectedElement
    ? linkedAppearanceElements[selectedElement.id]
    : undefined;
  const linkedElements = elements.filter((element) => linkedAppearanceElements[element.id]);
  const visibleLibraryAssets = useMemo(() => {
    const query = assetSearch.normalize('NFC').trim().toLocaleLowerCase('es');
    return appearanceAssetIds.filter((assetId) => {
      const category = appearanceAssetCategory(assetId);
      if (libraryCategory !== 'Todos' && category !== libraryCategory) return false;
      if (query === '') return true;
      return `${appearanceAssetLabel(assetId)} ${category} ${assetId}`
        .toLocaleLowerCase('es')
        .includes(query);
    });
  }, [assetSearch, libraryCategory]);
  const sendPreview = useCallback(() => {
    previewFrame.current?.contentWindow?.postMessage(
      { layout, type: appearancePreviewMessageType },
      window.location.origin,
    );
  }, [layout]);

  useEffect(() => {
    const receiveReady = (event: MessageEvent<unknown>) => {
      if (
        event.origin === window.location.origin &&
        event.source === previewFrame.current?.contentWindow &&
        typeof event.data === 'object' &&
        event.data !== null &&
        'type' in event.data &&
        event.data.type === appearancePreviewReadyType
      ) {
        sendPreview();
      }
    };
    window.addEventListener('message', receiveReady);
    sendPreview();
    return () => window.removeEventListener('message', receiveReady);
  }, [page, sendPreview]);

  useEffect(() => {
    let active = true;
    void publicRequest<{ readonly layout: SiteAppearanceLayout | null }>('/api/v1/site-appearance')
      .then(({ layout: received }) => {
        if (!active) return;
        if (received !== null)
          setLayout(hydrateAppearanceLayout(siteAppearanceLayoutSchema.parse(received)));
        setLoaded(true);
        setMessage(
          received === null
            ? 'Aún no hay una versión publicada. Puedes crear la primera.'
            : 'Apariencia publicada cargada.',
        );
      })
      .catch(() => {
        if (active)
          setMessage(
            'No fue posible cargar la apariencia publicada. Recarga antes de editar para conservar la versión existente.',
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const updateLayer = (id: string, change: Partial<SiteAppearanceLayer>) => {
    if (!loaded || busy.current) return;
    setLayout((current) => ({
      ...current,
      [page]: {
        ...current[page],
        layers: current[page].layers.map((layer) =>
          layer.id === id ? ({ ...layer, ...change } as SiteAppearanceLayer) : layer,
        ),
      },
    }));
  };

  const updateElement = (id: string, change: Partial<SiteAppearanceElement>) => {
    if (!loaded || busy.current) return;
    setLayout((current) => ({
      ...current,
      [page]: {
        ...current[page],
        elements: (current[page].elements ?? []).map((element) =>
          element.id === id ? ({ ...element, ...change } as SiteAppearanceElement) : element,
        ),
      },
    }));
  };

  const selectLayer = (layer: SiteAppearanceLayer) => {
    setSelectedId(layer.id);
    setSelectedElementId(null);
    if (layer.kind === 'ASSET' && layer.assetId) {
      setAssetCategory(appearanceAssetCategory(layer.assetId));
    }
  };

  const selectElement = (element: SiteAppearanceElement) => {
    setSelectedElementId(element.id);
    setSelectedId(null);
    if (element.assetId) setAssetCategory(appearanceAssetCategory(element.assetId));
  };

  const applyLibraryAsset = (assetId: SiteAppearanceAssetId) => {
    if (selectedElement && linkedAppearanceElements[selectedElement.id]) {
      updateElement(selectedElement.id, { assetId });
      setAssetCategory(appearanceAssetCategory(assetId));
      setToolPanel('PROPERTIES');
      return;
    }
    addLayer('ASSET', assetId);
    setToolPanel('PROPERTIES');
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, layer: SiteAppearanceLayer) => {
    if (!loaded || busy.current) return;
    const bounds = canvas.current?.getBoundingClientRect();
    if (!bounds) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: layer.id,
      offsetX: event.clientX - bounds.left - (layer.x / 100) * bounds.width,
      offsetY: event.clientY - bounds.top - (layer.y / 100) * bounds.height,
    };
    selectLayer(layer);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    const bounds = canvas.current?.getBoundingClientRect();
    if (!active || !bounds) return;
    const layer = layers.find(({ id }) => id === active.id);
    if (!layer) return;
    const x = Math.max(
      0,
      Math.min(
        100 - layer.width,
        ((event.clientX - bounds.left - active.offsetX) / bounds.width) * 100,
      ),
    );
    const y = Math.max(
      0,
      Math.min(92, ((event.clientY - bounds.top - active.offsetY) / bounds.height) * 100),
    );
    updateLayer(active.id, { x: rounded(x), y: rounded(y) });
  };

  const addLayer = (
    kind: SiteAppearanceLayer['kind'],
    requestedAssetId?: SiteAppearanceAssetId,
  ) => {
    if (!loaded || busy.current || layers.length >= 24) return;
    if (kind === 'ASSET' && !requestedAssetId) return;
    const id = `${kind.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const layer: SiteAppearanceLayer =
      kind === 'ASSET'
        ? {
            assetId: requestedAssetId,
            hiddenOnMobile: false,
            id,
            kind,
            width: 24,
            x: 62,
            y: 55,
            zIndex: 1,
          }
        : {
            content: 'Nuevo texto',
            hiddenOnMobile: false,
            id,
            kind,
            width: 28,
            x: 8,
            y: 14,
            zIndex: 2,
          };
    setLayout((current) => ({
      ...current,
      [page]: { ...current[page], layers: [...current[page].layers, layer] },
    }));
    setSelectedId(id);
    setSelectedElementId(null);
    if (kind === 'ASSET' && requestedAssetId) {
      setAssetCategory(appearanceAssetCategory(requestedAssetId));
    }
  };

  const duplicateLayer = (layer: SiteAppearanceLayer) => {
    if (!loaded || busy.current || layers.length >= 24) return;
    const duplicate: SiteAppearanceLayer = {
      ...layer,
      id: `${layer.kind.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`,
      x: Math.min(100 - layer.width, layer.x + 3),
      y: Math.min(92, layer.y + 3),
    };
    setLayout((current) => ({
      ...current,
      [page]: { ...current[page], layers: [...current[page].layers, duplicate] },
    }));
    selectLayer(duplicate);
  };

  const publish = async () => {
    if (busy.current || !loaded) return;
    if (!siteAppearanceLayoutSchema.safeParse(layout).success) {
      setMessage(
        'Revisa las capas: cada texto debe tener entre 1 y 160 caracteres y cada sección admite hasta 24 capas.',
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setMessage('Guardando y publicando…');
    try {
      const value = JSON.stringify(layout);
      if (pendingPublish.current?.value !== value) {
        pendingPublish.current = {
          value,
          createKey: crypto.randomUUID(),
          activateKey: crypto.randomUUID(),
        };
      }
      const attempt = pendingPublish.current;
      if (!attempt.versionId) {
        const created = await authorizedRequest<{
          readonly item: { readonly systemConfigurationId: string };
        }>('/api/v1/admin/system-configurations', {
          body: JSON.stringify({
            configurationKey: 'WEB_APPEARANCE_LAYOUT',
            reason: 'Edición desde Apariencia web',
            value: attempt.value,
          }),
          headers: { 'idempotency-key': attempt.createKey },
          method: 'POST',
        });
        attempt.versionId = created.item.systemConfigurationId;
      }
      await authorizedRequest(
        `/api/v1/admin/system-configurations/${attempt.versionId}/state-transitions`,
        {
          body: JSON.stringify({
            nextState: 'ACTIVE',
            reason: 'Publicar apariencia desde el editor visual',
          }),
          headers: { 'idempotency-key': attempt.activateKey },
          method: 'POST',
        },
      );
      pendingPublish.current = null;
      setMessage('Apariencia publicada. Las secciones públicas ya usarán esta versión.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible publicar la apariencia.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="appearance-editor">
      <div className="appearance-toolbar">
        <div>
          <p className="eyebrow">{pageLabels[page]}</p>
          <h2>Editor visual</h2>
          <p>
            Mantén la página real a la vista y usa los paneles laterales para elegir o ajustar cada
            elemento.
          </p>
        </div>
        <div className="actions">
          <button
            disabled
            title="La biblioteca visual está vacía hasta que se defina la nueva identidad."
            type="button"
          >
            Añadir imagen
          </button>
          <button
            disabled={!loaded || saving || layers.length >= 24}
            className="secondary"
            onClick={() => addLayer('TEXT')}
            type="button"
          >
            Añadir texto
          </button>
          <button disabled={!loaded || saving} onClick={() => void publish()} type="button">
            {saving ? 'Publicando…' : 'Guardar y publicar'}
          </button>
        </div>
        <div aria-label="Herramientas de diseño" className="appearance-tool-switch" role="group">
          <button
            aria-pressed={toolPanel === 'LIBRARY'}
            className={toolPanel === 'LIBRARY' ? '' : 'secondary'}
            onClick={() => setToolPanel('LIBRARY')}
            type="button"
          >
            Elementos
          </button>
          <button
            aria-pressed={toolPanel === 'PROPERTIES'}
            className={toolPanel === 'PROPERTIES' ? '' : 'secondary'}
            onClick={() => setToolPanel('PROPERTIES')}
            type="button"
          >
            Propiedades
          </button>
        </div>
      </div>

      <nav aria-label="Sección que se está editando" className="appearance-page-tabs">
        {pageIds.map((pageId) => (
          <button
            aria-pressed={page === pageId}
            className={page === pageId ? 'is-active' : 'secondary'}
            key={pageId}
            onClick={() => {
              setPage(pageId);
              setSelectedId(null);
              setSelectedElementId(null);
            }}
            type="button"
          >
            {pageLabels[pageId]}
          </button>
        ))}
      </nav>

      <section
        aria-labelledby="appearance-library-title"
        className={`appearance-library${toolPanel === 'LIBRARY' ? ' is-active' : ''}`}
      >
        <header>
          <div>
            <p className="eyebrow">Biblioteca incluida</p>
            <h2 id="appearance-library-title">Galería de elementos</h2>
            <p>
              {selectedLinkedElement
                ? `Elige la nueva imagen de ${selectedLinkedElement.label}. Su vínculo ${selectedLinkedElement.route} no cambiará.`
                : `Elige una imagen para añadirla a ${pageLabels[page]}; aparecerá de inmediato en la vista.`}
            </p>
          </div>
          <strong>{appearanceAssetIds.length} elementos disponibles</strong>
        </header>
        {linkedElements.length > 0 && (
          <div className="appearance-linked-accesses">
            <div>
              <h3>Accesos vinculados</h3>
              <p>
                Selecciona un acceso y luego una imagen. Solo cambia su aspecto; el destino queda
                protegido.
              </p>
            </div>
            <div aria-label="Accesos vinculados de la portada" role="group">
              {linkedElements.map((element) => {
                const linked = linkedAppearanceElements[element.id];
                if (!linked) return null;
                return (
                  <button
                    aria-pressed={selectedElementId === element.id}
                    className="secondary"
                    key={element.id}
                    onClick={() => selectElement(element)}
                    type="button"
                  >
                    {element.assetId && <img alt="" src={appearanceAssets[element.assetId]} />}
                    <span>{linked.label}</span>
                    <small>{linked.route} · vínculo fijo</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label className="appearance-library-search">
          Buscar por nombre o tipo
          <input
            onChange={(event) => {
              setAssetSearch(event.target.value);
              if (event.target.value.trim() !== '') setLibraryCategory('Todos');
            }}
            placeholder="Ej.: marco, banner, estrella…"
            type="search"
            value={assetSearch}
          />
        </label>
        <div aria-label="Categorías de la galería" className="appearance-library-categories">
          {['Todos', ...Object.keys(groupedAppearanceAssets)].map((category) => (
            <button
              aria-pressed={libraryCategory === category}
              className={libraryCategory === category ? '' : 'secondary'}
              key={category}
              onClick={() => setLibraryCategory(category)}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>
        <div aria-label="Elementos visuales disponibles" className="appearance-library-grid">
          {visibleLibraryAssets.map((assetId) => (
            <button
              aria-label={
                selectedLinkedElement
                  ? `Usar ${appearanceAssetLabel(assetId)} en ${selectedLinkedElement.label}`
                  : `Añadir ${appearanceAssetLabel(assetId)}`
              }
              className="secondary"
              disabled={!loaded || saving || layers.length >= 24}
              key={assetId}
              onClick={() => applyLibraryAsset(assetId)}
              title={
                selectedLinkedElement
                  ? `Cambiar la imagen de ${selectedLinkedElement.label}; conserva ${selectedLinkedElement.route}`
                  : `Añadir ${appearanceAssetLabel(assetId)} a ${pageLabels[page]}`
              }
              type="button"
            >
              <img alt="" loading="lazy" src={appearanceAssets[assetId]} />
              <span>{appearanceAssetLabel(assetId)}</span>
              <small>{appearanceAssetCategory(assetId)}</small>
            </button>
          ))}
          {visibleLibraryAssets.length === 0 && (
            <p className="appearance-library-empty">No hay elementos que coincidan.</p>
          )}
        </div>
      </section>

      <div className="appearance-workspace">
        <div
          className="appearance-canvas"
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerMove={moveDrag}
          onPointerUp={() => {
            drag.current = null;
          }}
          ref={canvas}
        >
          <div className="appearance-canvas-copy">
            <small>Ajuste libre avanzado · {pageLabels[page]}</small>
            <strong>
              {page === 'home' ? 'Tu próxima jugada comienza aquí.' : pageLabels[page]}
            </strong>
          </div>
          {layers.map((layer) => (
            <button
              aria-label={`Seleccionar capa ${layer.kind === 'TEXT' ? layer.content : layer.assetId ? appearanceAssetLabel(layer.assetId) : 'Imagen sin asignar'}`}
              aria-pressed={selectedId === layer.id}
              className={`appearance-editor-layer is-${layer.kind.toLowerCase()}`}
              key={layer.id}
              disabled={saving}
              onClick={() => selectLayer(layer)}
              onPointerDown={(event) => beginDrag(event, layer)}
              style={layerStyle(layer)}
              type="button"
            >
              {layer.kind === 'ASSET' && layer.assetId ? (
                <img alt="" draggable={false} src={appearanceAssets[layer.assetId]} />
              ) : (
                layer.content
              )}
            </button>
          ))}
        </div>

        <fieldset
          disabled={!loaded || saving}
          className={`appearance-inspector${toolPanel === 'PROPERTIES' ? ' is-active' : ''}`}
        >
          <h2>Elementos existentes</h2>
          <p>
            Textos y marcos visuales se pueden recolocar. Navegación, compras y formularios
            permanecen protegidos.
          </p>
          <ol className="appearance-layer-list" aria-label="Elementos existentes de la página">
            {elements.map((element) => (
              <li key={element.id}>
                <button
                  aria-pressed={selectedElementId === element.id}
                  className="secondary"
                  onClick={() => selectElement(element)}
                  type="button"
                >
                  <span>{appearanceElementLabels[element.id]}</span>
                  <small>
                    Orden {element.zIndex}
                    {element.hiddenOnMobile ? ' · Oculto en móvil' : ''}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          {selectedElement && (
            <div className="appearance-element-controls">
              <h2>Propiedades del elemento</h2>
              {selectedLinkedElement ? (
                <div className="appearance-linked-summary">
                  <strong>{selectedLinkedElement.label}</strong>
                  <span>{selectedLinkedElement.route}</span>
                  <small>Vínculo protegido: la galería solo reemplaza su imagen.</small>
                  {selectedElement.assetId && (
                    <img alt="" src={appearanceAssets[selectedElement.assetId]} />
                  )}
                  <button
                    className="secondary"
                    onClick={() => setToolPanel('LIBRARY')}
                    type="button"
                  >
                    Elegir otra imagen
                  </button>
                </div>
              ) : (
                <>
                  <Range
                    label="Desplazamiento horizontal"
                    max={50}
                    min={-50}
                    onChange={(offsetX) => updateElement(selectedElement.id, { offsetX })}
                    value={selectedElement.offsetX}
                  />
                  <Range
                    label="Desplazamiento vertical"
                    max={50}
                    min={-50}
                    onChange={(offsetY) => updateElement(selectedElement.id, { offsetY })}
                    value={selectedElement.offsetY}
                  />
                  <Range
                    label="Ancho"
                    max={120}
                    min={40}
                    onChange={(width) => updateElement(selectedElement.id, { width })}
                    value={selectedElement.width}
                  />
                  <Range
                    label="Orden del elemento"
                    max={30}
                    onChange={(zIndex) => updateElement(selectedElement.id, { zIndex })}
                    value={selectedElement.zIndex}
                  />
                  <label className="appearance-checkbox">
                    <input
                      checked={selectedElement.hiddenOnMobile}
                      onChange={(event) =>
                        updateElement(selectedElement.id, { hiddenOnMobile: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Ocultar en teléfonos
                  </label>
                </>
              )}
              <button
                className="secondary"
                onClick={() => {
                  const original = defaultAppearanceElements[page].find(
                    ({ id }) => id === selectedElement.id,
                  );
                  if (original) updateElement(selectedElement.id, original);
                }}
                type="button"
              >
                Restablecer posición
              </button>
            </div>
          )}
          <h2>Capas de {pageLabels[page]}</h2>
          <p>{layers.length} de 24 capas · las primeras de la lista quedan delante.</p>
          <ol className="appearance-layer-list" aria-label="Lista de capas">
            {[...layers]
              .sort((a, b) => b.zIndex - a.zIndex || layers.indexOf(b) - layers.indexOf(a))
              .map((layer) => (
                <li key={layer.id}>
                  <button
                    aria-pressed={selectedId === layer.id}
                    className="secondary"
                    onClick={() => selectLayer(layer)}
                    type="button"
                  >
                    <span>
                      {layer.kind === 'TEXT'
                        ? layer.content || 'Texto vacío'
                        : layer.assetId
                          ? appearanceAssetLabel(layer.assetId)
                          : 'Imagen sin asignar'}
                    </span>
                    <small>
                      Orden {layer.zIndex}
                      {layer.hiddenOnMobile ? ' · Oculta en móvil' : ''}
                    </small>
                  </button>
                </li>
              ))}
          </ol>
          <h2>Propiedades de la capa</h2>
          {selected ? (
            <>
              {selected.kind === 'TEXT' ? (
                <label>
                  Texto
                  <textarea
                    maxLength={160}
                    value={selected.content}
                    onChange={(event) => updateLayer(selected.id, { content: event.target.value })}
                  />
                </label>
              ) : (
                <div className="appearance-asset-picker">
                  <label>
                    Categoría visual
                    <select
                      onChange={(event) => setAssetCategory(event.target.value)}
                      value={assetCategory}
                    >
                      {Object.keys(groupedAppearanceAssets).map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Imagen aprobada
                    <select
                      value={selected.assetId}
                      onChange={(event) => {
                        const assetId = event.target.value as SiteAppearanceAssetId;
                        setAssetCategory(appearanceAssetCategory(assetId));
                        updateLayer(selected.id, { assetId });
                      }}
                    >
                      {Object.entries(groupedAppearanceAssets).map(([category, assetIds]) => (
                        <optgroup key={category} label={category}>
                          {assetIds.map((assetId) => (
                            <option key={assetId} value={assetId}>
                              {appearanceAssetLabel(assetId)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <div
                    aria-label={`Miniaturas de ${assetCategory}`}
                    className="appearance-asset-grid"
                  >
                    {groupedAppearanceAssets[assetCategory]?.map((assetId) => (
                      <button
                        aria-pressed={selected.assetId === assetId}
                        className="secondary"
                        key={assetId}
                        onClick={() => updateLayer(selected.id, { assetId })}
                        title={appearanceAssetLabel(assetId)}
                        type="button"
                      >
                        <img alt="" loading="lazy" src={appearanceAssets[assetId]} />
                        <span>{appearanceAssetLabel(assetId)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Range
                label="Posición horizontal"
                max={100 - selected.width}
                onChange={(x) => updateLayer(selected.id, { x })}
                value={selected.x}
              />
              <Range
                label="Posición vertical"
                max={92}
                onChange={(y) => updateLayer(selected.id, { y })}
                value={selected.y}
              />
              <Range
                label="Tamaño"
                max={100}
                min={5}
                onChange={(width) =>
                  updateLayer(selected.id, { width, x: Math.min(selected.x, 100 - width) })
                }
                value={selected.width}
              />
              <Range
                label="Orden de capa"
                max={30}
                onChange={(zIndex) => updateLayer(selected.id, { zIndex })}
                value={selected.zIndex}
              />
              <label className="appearance-checkbox">
                <input
                  checked={selected.hiddenOnMobile}
                  onChange={(event) =>
                    updateLayer(selected.id, { hiddenOnMobile: event.target.checked })
                  }
                  type="checkbox"
                />
                Ocultar en teléfonos
              </label>
              <div
                aria-label="Alineación de la capa"
                className="appearance-quick-actions"
                role="group"
              >
                <button
                  className="secondary"
                  onClick={() => updateLayer(selected.id, { x: 0 })}
                  type="button"
                >
                  Izquierda
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    updateLayer(selected.id, { x: rounded((100 - selected.width) / 2) })
                  }
                  type="button"
                >
                  Centro
                </button>
                <button
                  className="secondary"
                  onClick={() => updateLayer(selected.id, { x: 100 - selected.width })}
                  type="button"
                >
                  Derecha
                </button>
              </div>
              <div
                aria-label="Orden rápido de la capa"
                className="appearance-quick-actions"
                role="group"
              >
                <button
                  className="secondary"
                  onClick={() => updateLayer(selected.id, { zIndex: 30 })}
                  type="button"
                >
                  Traer al frente
                </button>
                <button
                  className="secondary"
                  onClick={() => updateLayer(selected.id, { zIndex: 0 })}
                  type="button"
                >
                  Enviar al fondo
                </button>
              </div>
              <button
                className="secondary"
                disabled={layers.length >= 24}
                onClick={() => duplicateLayer(selected)}
                type="button"
              >
                Duplicar capa
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setLayout((current) => ({
                    ...current,
                    [page]: {
                      ...current[page],
                      layers: current[page].layers.filter(({ id }) => id !== selected.id),
                    },
                  }));
                  setSelectedId(null);
                }}
                type="button"
              >
                Quitar capa
              </button>
            </>
          ) : (
            <p>Selecciona una capa o añade una nueva.</p>
          )}
        </fieldset>
      </div>

      <section aria-labelledby="appearance-live-preview" className="appearance-live-preview">
        <header>
          <div>
            <p className="eyebrow">Resultado sin publicar</p>
            <h2 id="appearance-live-preview">Vista real · {pageLabels[page]}</h2>
            <p>
              Esta vista usa la página verdadera y recibe los cambios del borrador mientras editas.
            </p>
          </div>
          <div aria-label="Tamaño de la vista" className="actions" role="group">
            <button
              aria-pressed={previewDevice === 'DESKTOP'}
              className={previewDevice === 'DESKTOP' ? '' : 'secondary'}
              onClick={() => setPreviewDevice('DESKTOP')}
              type="button"
            >
              Escritorio
            </button>
            <button
              aria-pressed={previewDevice === 'MOBILE'}
              className={previewDevice === 'MOBILE' ? '' : 'secondary'}
              onClick={() => setPreviewDevice('MOBILE')}
              type="button"
            >
              Teléfono
            </button>
          </div>
        </header>
        <div className={`appearance-preview-viewport is-${previewDevice.toLowerCase()}`}>
          <iframe
            key={page}
            onLoad={sendPreview}
            ref={previewFrame}
            src={`${previewPaths[page]}?appearance-preview=1`}
            title={`Vista real de ${pageLabels[page]}`}
          />
        </div>
      </section>
      <p className="status" role="status">
        {message}
      </p>
    </section>
  );
}

function Range({
  label,
  max,
  min = 0,
  onChange,
  value,
}: {
  readonly label: string;
  readonly max: number;
  readonly min?: number;
  readonly onChange: (value: number) => void;
  readonly value: number;
}) {
  return (
    <div className="appearance-range">
      <label>
        {label}: {Math.round(value)}
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step="1"
          type="range"
          value={value}
        />
      </label>
      <label>
        Valor exacto
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step="1"
          type="number"
          value={value}
        />
      </label>
    </div>
  );
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}
