import { type FormEvent, useEffect, useRef, useState } from 'react';

import { authorizedBlob, authorizedRequest } from '../identity/api.js';

interface Slide {
  readonly active: boolean;
  readonly altText: string;
  readonly heightPx: number;
  readonly linkPath: string | null;
  readonly position: number;
  readonly slideId: string;
  readonly version: number;
  readonly widthPx: number;
}

function CarouselImage({ slide }: { slide: Slide }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    void authorizedBlob(`/api/v1/admin/home-carousel/${slide.slideId}/content`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (alive) setSrc(objectUrl);
      })
      .catch(() => alive && setSrc(undefined));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slide.slideId, slide.version]);
  return src ? <img alt={slide.altText} src={src} /> : <div>Cargando vista previa…</div>;
}

const destinations = [
  ['/shop', 'Tienda'],
  ['/preorders', 'Preventas'],
  ['/community', 'Comunidad'],
] as const;

export function CarouselAdminPanel() {
  const [slides, setSlides] = useState<readonly Slide[]>([]);
  const [revision, setRevision] = useState('');
  const [message, setMessage] = useState('Cargando banners…');
  const [busy, setBusy] = useState(false);
  const uploadAttempt = useRef<{ signature: string; key: string } | null>(null);

  const load = async () => {
    try {
      const result = await authorizedRequest<{ items: Slide[]; revision: string }>(
        '/api/v1/admin/home-carousel',
      );
      setSlides(result.items);
      setRevision(result.revision);
      setMessage(
        result.items.length ? 'Banners cargados.' : 'Todavía no hay banners configurados.',
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el carrusel.');
      return false;
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    try {
      const form = new FormData(formElement);
      form.set('active', form.has('active') ? 'true' : 'false');
      const file = (formElement.elements.namedItem('file') as HTMLInputElement | null)?.files?.[0];
      const signature = JSON.stringify([
        form.get('active'),
        form.get('altText'),
        form.get('linkPath'),
        file instanceof File ? [file.name, file.size, file.lastModified] : null,
      ]);
      if (uploadAttempt.current?.signature !== signature)
        uploadAttempt.current = { signature, key: crypto.randomUUID() };
      await authorizedRequest('/api/v1/admin/home-carousel', {
        body: form,
        headers: { 'idempotency-key': uploadAttempt.current.key },
        method: 'POST',
      });
      uploadAttempt.current = null;
      formElement.reset();
      if (await load()) setMessage('Banner guardado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el banner.');
    } finally {
      setBusy(false);
    }
  };

  const update = async (
    slide: Slide,
    patch: Partial<Pick<Slide, 'active' | 'altText' | 'linkPath'>>,
  ) => {
    setBusy(true);
    try {
      await authorizedRequest(`/api/v1/admin/home-carousel/${slide.slideId}`, {
        body: JSON.stringify({
          active: slide.active,
          altText: slide.altText,
          linkPath: slide.linkPath,
          ...patch,
          expectedVersion: slide.version,
        }),
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        method: 'PUT',
      });
      if (await load()) setMessage('Banner actualizado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el banner.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const orderedSlideIds = slides.map((slide) => slide.slideId);
    const currentId = orderedSlideIds[index];
    const targetId = orderedSlideIds[target];
    if (currentId === undefined || targetId === undefined) return;
    orderedSlideIds[index] = targetId;
    orderedSlideIds[target] = currentId;
    setBusy(true);
    try {
      await authorizedRequest('/api/v1/admin/home-carousel/order', {
        body: JSON.stringify({ expectedRevision: revision, orderedSlideIds }),
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        method: 'PUT',
      });
      if (await load()) setMessage('Orden del carrusel guardado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo ordenar el carrusel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cut-panel admin-module" aria-label="Carrusel de inicio">
      <h2>Carrusel de inicio</h2>
      <p>Sube banners manualmente y vincúlalos solo a Tienda, Preventas o Comunidad.</p>
      <p className="status" role="status">
        {message}
      </p>
      <form encType="multipart/form-data" onSubmit={(event) => void upload(event)}>
        <h3>Agregar banner</h3>
        <label>
          Imagen
          <input
            accept="image/jpeg,image/png,image/webp,image/avif"
            name="file"
            required
            type="file"
          />
        </label>
        <label>
          Texto alternativo
          <input name="altText" required />
        </label>
        <label>
          Destino
          <select defaultValue="/shop" name="linkPath">
            {destinations.map(([path, label]) => (
              <option key={path} value={path}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input defaultChecked name="active" type="checkbox" value="true" /> Publicar
          inmediatamente
        </label>
        <button disabled={busy} type="submit">
          {busy ? 'Guardando…' : 'Guardar banner'}
        </button>
      </form>
      <div className="admin-form-grid" aria-label="Banners configurados">
        {slides.map((slide, index) => (
          <article className="commerce-card" key={slide.slideId}>
            <CarouselImage slide={slide} />
            <strong>Banner {index + 1}</strong>
            <small>
              {slide.widthPx} × {slide.heightPx}px · {slide.active ? 'Publicado' : 'Desactivado'}
            </small>
            <label>
              Texto alternativo
              <input
                defaultValue={slide.altText}
                onBlur={(event) => {
                  if (event.target.value !== slide.altText)
                    void update(slide, { altText: event.target.value });
                }}
              />
            </label>
            <label>
              Destino
              <select
                defaultValue={slide.linkPath ?? ''}
                onChange={(event) => void update(slide, { linkPath: event.target.value })}
              >
                <option value="" disabled>
                  Sin destino
                </option>
                {destinations.map(([path, label]) => (
                  <option key={path} value={path}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="card-actions">
              <button
                disabled={busy || index === 0}
                onClick={() => void move(index, -1)}
                type="button"
              >
                Subir
              </button>
              <button
                disabled={busy || index === slides.length - 1}
                onClick={() => void move(index, 1)}
                type="button"
              >
                Bajar
              </button>
              <button
                disabled={busy}
                onClick={() => void update(slide, { active: !slide.active })}
                type="button"
              >
                {slide.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
