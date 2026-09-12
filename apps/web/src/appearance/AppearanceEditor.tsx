import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  type SiteAppearanceAssetId,
  type SiteAppearanceLayout,
  type SiteAppearanceLayer,
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

export function AppearanceEditor() {
  const [layout, setLayout] = useState<SiteAppearanceLayout>(defaultAppearanceLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('Cargando apariencia publicada…');
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const layers = layout.home.layers;
  const selected = useMemo(
    () => layers.find(({ id }) => id === selectedId) ?? null,
    [layers, selectedId],
  );

  useEffect(() => {
    void publicRequest<{ readonly layout: SiteAppearanceLayout | null }>('/api/v1/site-appearance')
      .then(({ layout: loaded }) => {
        if (loaded !== null) setLayout(loaded);
        setMessage(
          loaded === null
            ? 'Aún no hay una versión publicada. Puedes crear la primera.'
            : 'Apariencia publicada cargada.',
        );
      })
      .catch(() => setMessage('No fue posible cargar la apariencia publicada.'));
  }, []);

  const updateLayer = (id: string, change: Partial<SiteAppearanceLayer>) => {
    setLayout((current) => ({
      ...current,
      home: {
        layers: current.home.layers.map((layer) =>
          layer.id === id ? ({ ...layer, ...change } as SiteAppearanceLayer) : layer,
        ),
      },
    }));
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, layer: SiteAppearanceLayer) => {
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
      home: { layers: [...current.home.layers, layer] },
    }));
    setSelectedId(id);
  };

  const publish = async () => {
    if (saving) return;
    setSaving(true);
    setMessage('Guardando y publicando…');
    try {
      const created = await authorizedRequest<{
        readonly item: { readonly systemConfigurationId: string };
      }>('/api/v1/admin/system-configurations', {
        body: JSON.stringify({
          configurationKey: 'WEB_APPEARANCE_LAYOUT',
          reason: 'Edición desde Apariencia web',
          value: JSON.stringify(layout),
        }),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'POST',
      });
      await authorizedRequest(
        `/api/v1/admin/system-configurations/${created.item.systemConfigurationId}/state-transitions`,
        {
          body: JSON.stringify({
            nextState: 'ACTIVE',
            reason: 'Publicar apariencia desde el editor visual',
          }),
          headers: { 'idempotency-key': crypto.randomUUID() },
          method: 'POST',
        },
      );
      setMessage('Apariencia publicada. La portada ya usará esta versión.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible publicar la apariencia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="appearance-editor">
      <div className="appearance-toolbar">
        <div>
          <p className="eyebrow">Portada</p>
          <h2>Capas y posición</h2>
          <p>Arrastra una capa dentro de la vista previa o ajusta sus controles.</p>
        </div>
        <div className="actions">
          <button onClick={() => addLayer('ASSET')} type="button">
            Añadir imagen
          </button>
          <button className="secondary" onClick={() => addLayer('TEXT')} type="button">
            Añadir texto
          </button>
          <button disabled={saving} onClick={() => void publish()} type="button">
            {saving ? 'Publicando…' : 'Guardar y publicar'}
          </button>
        </div>
      </div>

      <div className="appearance-workspace">
        <div
          className="appearance-canvas"
          onPointerMove={moveDrag}
          onPointerUp={() => {
            drag.current = null;
          }}
          ref={canvas}
        >
          <div className="appearance-canvas-copy">
            <small>TCG · Comunidad · Competencia</small>
            <strong>Tu próxima jugada comienza aquí.</strong>
          </div>
          {layers.map((layer) => (
            <button
              aria-label={`Seleccionar capa ${layer.kind === 'TEXT' ? layer.content : assetLabels[layer.assetId ?? 'burst-red']}`}
              aria-pressed={selectedId === layer.id}
              className={`appearance-editor-layer is-${layer.kind.toLowerCase()}`}
              key={layer.id}
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

        <aside className="appearance-inspector">
          <h2>Propiedades de la capa</h2>
          {selected ? (
            <>
              {selected.kind === 'TEXT' ? (
                <label>
                  Texto
                  <textarea
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
                    home: { layers: current.home.layers.filter(({ id }) => id !== selected.id) },
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
        </aside>
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
