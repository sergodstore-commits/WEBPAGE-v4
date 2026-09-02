CREATE TABLE public.editorial_entry_media (
  editorial_media_id uuid PRIMARY KEY,
  editorial_entry_id uuid NOT NULL REFERENCES public.editorial_entries(editorial_entry_id),
  resource_id uuid NOT NULL UNIQUE REFERENCES public.resource_assets(resource_id),
  created_by uuid NOT NULL REFERENCES public.user_accounts(account_id),
  created_at timestamptz NOT NULL,
  UNIQUE (editorial_entry_id, resource_id)
);

CREATE INDEX editorial_entry_media_entry_idx
  ON public.editorial_entry_media(editorial_entry_id, created_at, editorial_media_id);

CREATE FUNCTION public.sergod_editorial_media_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.resource_assets resource
     WHERE resource.resource_id = NEW.resource_id
       AND resource.resource_class IN ('CONTENT_IMAGE', 'COMIC_PAGE')
       AND resource.state = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'editorial media requires an active editorial image'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.sergod_editorial_media_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'editorial media ownership is immutable' USING ERRCODE = '23514';
END $$;

CREATE TRIGGER editorial_entry_media_validate
  BEFORE INSERT ON public.editorial_entry_media
  FOR EACH ROW EXECUTE FUNCTION public.sergod_editorial_media_validate();

CREATE TRIGGER editorial_entry_media_immutable
  BEFORE UPDATE OR DELETE ON public.editorial_entry_media
  FOR EACH ROW EXECUTE FUNCTION public.sergod_editorial_media_immutable();

ALTER TABLE public.editorial_entry_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editorial_entry_media FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sergod_editorial_media_validate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sergod_editorial_media_immutable() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.editorial_entry_media FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.editorial_entry_media FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON public.editorial_entry_media TO service_role;
  END IF;
END $$;
