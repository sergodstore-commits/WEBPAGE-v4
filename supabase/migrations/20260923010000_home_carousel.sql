CREATE TABLE public.home_carousel_slides (
  slide_id uuid PRIMARY KEY,
  resource_id uuid NOT NULL UNIQUE REFERENCES public.resource_assets(resource_id),
  alt_text text NOT NULL CHECK (char_length(btrim(alt_text)) BETWEEN 1 AND 240),
  link_path text CHECK (char_length(link_path) <= 240 AND link_path ~ '^/(shop(/[a-zA-Z0-9-]+)?|preorders|community|news(/[a-z0-9-]+)?|tournaments(/[a-z0-9-]+)?|quests(/[a-z0-9-]+)?|comics(/[a-z0-9-]+)?|loyalty)$'),
  active boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 24),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES public.user_accounts(account_id),
  updated_by uuid NOT NULL REFERENCES public.user_accounts(account_id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT home_carousel_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION public.sergod_home_carousel_resource_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
    RAISE EXCEPTION 'carousel resource ownership is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.resource_assets resource
    WHERE resource.resource_id = NEW.resource_id AND resource.resource_class = 'CONTENT_IMAGE'
      AND resource.state = 'ACTIVE' AND resource.secure_storage_key LIKE 'home/carousel/%'
  ) THEN
    RAISE EXCEPTION 'carousel requires a validated dedicated image' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER home_carousel_resource_validate BEFORE INSERT OR UPDATE
  ON public.home_carousel_slides FOR EACH ROW
  EXECUTE FUNCTION public.sergod_home_carousel_resource_validate();

ALTER TABLE public.home_carousel_slides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.home_carousel_slides FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sergod_home_carousel_resource_validate() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.home_carousel_slides FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.home_carousel_slides FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public.home_carousel_slides TO service_role;
  END IF;
END $$;
