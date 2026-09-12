import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  siteAppearanceLayoutSchema,
  type SiteAppearanceAssetId,
  type SiteAppearanceLayout,
  type SiteAppearanceLayer,
  type SiteAppearancePageId,
} from '@sergod/contracts';

import { authorizedRequest, publicRequest } from '../identity/api.js';
import {
  appearanceAssetIds,
  appearanceAssets,
  defaultAppearanceLayout,
  layerStyle,
} from './appearance-model.js';

const assetLabels: Readonly<Record<SiteAppearanceAssetId, string>> = {
  'burst-red': 'Impacto rojo',
  'brush-cyan': 'Pincelada cian',
  'brush-red': 'Pincelada roja',
  'brush-white': 'Pincelada blanca',
  'fragments-red': 'Fragmentos rojos',
  'halftone-red': 'Trama halftone',
};

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

export function AppearanceEditor() {
  const [layout, setLayout] = useState<SiteAppearanceLayout>(defaultAppearanceLayout);
  const [page, setPage] = useState<SiteAppearancePageId>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('Cargando apariencia publicada…');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const busy = useRef(false);
  const pendingPublish = useRef<{
    value: string;
    createKey: string;
    activateKey: string;
    versionId?: string;
  } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const layers = layout[page].layers;
  const selected = useMemo(
    () => layers.find(({ id }) => id === selectedId) ?? null,
    [layers, selectedId],
  );

  useEffect(() => {
    let active = true;
    void publicRequest<{ readonly layout: SiteAppearanceLayout | null }>('/api/v1/site-appearance')
      .then(({ layout: received }) => {
        if (!active) return;
        if (received !== null) setLayout(siteAppearanceLayoutSchema.parse(received));
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
        layers: current[page].layers.map((layer) =>
          layer.id === id ? ({ ...layer, ...change } as SiteAppearanceLayer) : layer,
        ),
      },
    }));
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
    setSelectedId(layer.id);
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

  const addLayer = (kind: SiteAppearanceLayer['kind']) => {
    if (!loaded || busy.current || layers.length >= 24) return;
    const id = `${kind.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
    const layer: SiteAppearanceLayer =
      kind === 'ASSET'
        ? {
            assetId: 'burst-red',
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
      [page]: { layers: [...current[page].layers, layer] },
    }));
    setSelectedId(id);
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
          <h2>Capas y posición</h2>
          <p>
            Arrastra una capa en el esquema o selecciónala en la lista para ajustar sus controles.
          </p>
        </div>
        <div className="actions">
          <button
            disabled={!loaded || saving || layers.length >= 24}
            onClick={() => addLayer('ASSET')}
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
            }}
            type="button"
          >
            {pageLabels[pageId]}
          </button>
        ))}
      </nav>

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
            <small>Esquema de capas · {pageLabels[page]}</small>
            <strong>
              {page === 'home' ? 'Tu próxima jugada comienza aquí.' : pageLabels[page]}
            </strong>
          </div>
          {layers.map((layer) => (
            <button
              aria-label={`Seleccionar capa ${layer.kind === 'TEXT' ? layer.content : assetLabels[layer.assetId ?? 'burst-red']}`}
              aria-pressed={selectedId === layer.id}
              className={`appearance-editor-layer is-${layer.kind.toLowerCase()}`}
              key={layer.id}
              disabled={saving}
              onClick={() => setSelectedId(layer.id)}
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

        <fieldset disabled={!loaded || saving} className="appearance-inspector">
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
                    onClick={() => setSelectedId(layer.id)}
                    type="button"
                  >
                    <span>
                      {layer.kind === 'TEXT'
                        ? layer.content || 'Texto vacío'
                        : assetLabels[layer.assetId ?? 'burst-red']}
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
                <label>
                  Imagen aprobada
                  <select
                    value={selected.assetId}
                    onChange={(event) =>
                      updateLayer(selected.id, {
                        assetId: event.target.value as SiteAppearanceAssetId,
                      })
                    }
                  >
                    {appearanceAssetIds.map((assetId) => (
                      <option key={assetId} value={assetId}>
                        {assetLabels[assetId]}
                      </option>
                    ))}
                  </select>
                </label>
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
              <button
                className="secondary"
                onClick={() => {
                  setLayout((current) => ({
                    ...current,
                    [page]: {
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
  );
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}
