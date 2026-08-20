-- The remote history already contains the Phase 2 security hardening migration. Repeating its
-- idempotent function/default-privilege guarantees here keeps a clean Node migration sequence
-- semantically aligned without rewriting an applied historical migration.
ALTER FUNCTION public.sergod_prevent_change() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sergod_protect_legal_document() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sergod_protect_legal_version() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sergod_validate_active_legal_document() SET search_path = pg_catalog, public;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public_service_info (
  public_service_info_id uuid PRIMARY KEY,
  branch_id uuid NOT NULL UNIQUE REFERENCES branches(branch_id),
  public_address text NOT NULL CHECK (length(trim(public_address)) > 0),
  opening_hours text NOT NULL CHECK (length(trim(opening_hours)) > 0),
  public_contacts text NOT NULL CHECK (length(trim(public_contacts)) > 0),
  directions text,
  map_url text CHECK (map_url IS NULL OR (map_url ~ '^https://' AND map_url !~ '^https://[^/]*@')),
  state text NOT NULL CHECK (state IN ('DRAFT','PUBLISHED','WITHDRAWN')),
  current_revision_number integer NOT NULL CHECK (current_revision_number > 0),
  current_published_revision_id uuid,
  author_account_id uuid NOT NULL REFERENCES user_accounts(account_id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE content_revisions (
  revision_id uuid PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('CONTENT_ITEM','PUBLIC_SERVICE_INFO','COMIC_SERIES','COMIC_CHAPTER')),
  source_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  snapshot_contract text NOT NULL CHECK (snapshot_contract='ContentRevisionSnapshot.v1'),
  snapshot_schema_version integer NOT NULL CHECK (snapshot_schema_version=1),
  title_snapshot text NOT NULL CHECK (length(trim(title_snapshot)) > 0),
  summary_snapshot text,
  body_or_description_snapshot jsonb,
  slug_snapshot text,
  public_byline_snapshot text,
  editorial_state_snapshot text NOT NULL,
  public_published_at_snapshot timestamptz,
  public_withdrawn_at_snapshot timestamptz,
  featured_or_content_position_snapshot integer,
  author_public_id_snapshot uuid,
  ordered_resources_snapshot jsonb NOT NULL CHECK (jsonb_typeof(ordered_resources_snapshot)='array'),
  changed_by uuid NOT NULL REFERENCES user_accounts(account_id),
  changed_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  UNIQUE (source_type,source_id,revision_number),
  UNIQUE (revision_id,source_id),
  CHECK (source_type<>'PUBLIC_SERVICE_INFO' OR (
    summary_snapshot IS NULL AND slug_snapshot IS NULL AND public_byline_snapshot IS NULL
    AND featured_or_content_position_snapshot IS NULL AND author_public_id_snapshot IS NULL
    AND editorial_state_snapshot IN ('DRAFT','PUBLISHED','WITHDRAWN')
    AND jsonb_typeof(body_or_description_snapshot)='object'
    AND ordered_resources_snapshot='[]'::jsonb
  ))
);
ALTER TABLE public_service_info ADD CONSTRAINT public_service_info_published_revision_fk
  FOREIGN KEY (current_published_revision_id, public_service_info_id)
  REFERENCES content_revisions(revision_id, source_id);
ALTER TABLE public_service_info ADD CONSTRAINT public_service_info_publication_ck CHECK (
  (state = 'PUBLISHED' AND current_published_revision_id IS NOT NULL AND current_revision_number > 0)
  OR (state <> 'PUBLISHED')
);
CREATE INDEX public_service_info_published_revision_idx ON public_service_info(current_published_revision_id,public_service_info_id);
CREATE INDEX public_service_info_author_idx ON public_service_info(author_account_id);
CREATE INDEX content_revisions_changed_by_idx ON content_revisions(changed_by);

CREATE FUNCTION sergod_validate_public_service_info_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_revisions r
    WHERE r.source_type='PUBLIC_SERVICE_INFO' AND r.source_id=NEW.public_service_info_id
      AND r.revision_number=NEW.current_revision_number
      AND r.editorial_state_snapshot=NEW.state
      AND r.body_or_description_snapshot->>'publicAddress'=NEW.public_address
      AND r.body_or_description_snapshot->>'openingHours'=NEW.opening_hours
      AND r.body_or_description_snapshot->>'publicContacts'=NEW.public_contacts
      AND (r.body_or_description_snapshot->>'directions') IS NOT DISTINCT FROM NEW.directions
      AND (r.body_or_description_snapshot->>'mapUrl') IS NOT DISTINCT FROM NEW.map_url
      AND (NEW.state<>'PUBLISHED' OR r.revision_id=NEW.current_published_revision_id)
  ) THEN RAISE EXCEPTION 'public service info must match its current revision' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER public_service_info_revision_valid
AFTER INSERT OR UPDATE ON public_service_info DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sergod_validate_public_service_info_revision();

CREATE TABLE shipping_zones (
  shipping_zone_id uuid PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES branches(branch_id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  state text NOT NULL CHECK (state IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  first_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  updated_by uuid NOT NULL REFERENCES user_accounts(account_id),
  activated_by uuid REFERENCES user_accounts(account_id),
  activated_at timestamptz,
  deactivated_by uuid REFERENCES user_accounts(account_id),
  deactivated_at timestamptz,
  retired_by uuid REFERENCES user_accounts(account_id),
  retired_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX shipping_zones_name_ci_idx ON shipping_zones (branch_id,lower(name));
CREATE INDEX shipping_zones_created_by_idx ON shipping_zones(created_by);
CREATE INDEX shipping_zones_updated_by_idx ON shipping_zones(updated_by);
CREATE INDEX shipping_zones_activated_by_idx ON shipping_zones(activated_by);
CREATE INDEX shipping_zones_deactivated_by_idx ON shipping_zones(deactivated_by);
CREATE INDEX shipping_zones_retired_by_idx ON shipping_zones(retired_by);

CREATE TABLE shipping_zone_communes (
  shipping_zone_commune_id uuid PRIMARY KEY,
  shipping_zone_id uuid NOT NULL REFERENCES shipping_zones(shipping_zone_id),
  commune_name_normalized text NOT NULL CHECK (commune_name_normalized = upper(trim(commune_name_normalized))),
  commune_name_display text NOT NULL CHECK (length(trim(commune_name_display)) > 0),
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  created_at timestamptz NOT NULL,
  UNIQUE (shipping_zone_id, commune_name_normalized)
);
CREATE INDEX shipping_zone_communes_name_idx ON shipping_zone_communes (commune_name_normalized);
CREATE INDEX shipping_zone_communes_created_by_idx ON shipping_zone_communes(created_by);

CREATE TABLE shipping_options (
  shipping_option_id uuid PRIMARY KEY,
  shipping_zone_id uuid NOT NULL REFERENCES shipping_zones(shipping_zone_id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  carrier text NOT NULL CHECK (carrier IN ('CHILEXPRESS','STARKEN')),
  fee_amount_clp integer NOT NULL CHECK (fee_amount_clp >= 0),
  state text NOT NULL CHECK (state IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  first_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES user_accounts(account_id),
  updated_by uuid NOT NULL REFERENCES user_accounts(account_id),
  activated_by uuid REFERENCES user_accounts(account_id),
  activated_at timestamptz,
  deactivated_by uuid REFERENCES user_accounts(account_id),
  deactivated_at timestamptz,
  retired_by uuid REFERENCES user_accounts(account_id),
  retired_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX shipping_options_zone_state_idx ON shipping_options (shipping_zone_id,state);
CREATE UNIQUE INDEX shipping_options_one_active_carrier_idx ON shipping_options(shipping_zone_id,carrier) WHERE state='ACTIVE';
CREATE INDEX shipping_options_created_by_idx ON shipping_options(created_by);
CREATE INDEX shipping_options_updated_by_idx ON shipping_options(updated_by);
CREATE INDEX shipping_options_activated_by_idx ON shipping_options(activated_by);
CREATE INDEX shipping_options_deactivated_by_idx ON shipping_options(deactivated_by);
CREATE INDEX shipping_options_retired_by_idx ON shipping_options(retired_by);

CREATE TABLE shipping_configuration_history (
  shipping_configuration_history_id uuid PRIMARY KEY,
  source_type text NOT NULL CHECK (source_type IN ('SHIPPING_ZONE','SHIPPING_OPTION')),
  source_id uuid NOT NULL,
  previous_state text,
  new_state text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  actor_id uuid NOT NULL REFERENCES user_accounts(account_id),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX shipping_configuration_history_source_idx ON shipping_configuration_history(source_type,source_id,occurred_at);
CREATE INDEX shipping_configuration_history_actor_idx ON shipping_configuration_history(actor_id);

CREATE FUNCTION sergod_validate_active_shipping_commune() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.state='ACTIVE' AND NEW.state<>'ACTIVE' AND EXISTS (
    SELECT 1 FROM public.shipping_options o
    WHERE o.shipping_zone_id=NEW.shipping_zone_id AND o.state='ACTIVE'
  ) THEN RAISE EXCEPTION 'active shipping options must be deactivated with their zone' USING ERRCODE='23514'; END IF;
  IF NEW.state = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM public.shipping_zone_communes c
    JOIN public.shipping_zones z ON z.shipping_zone_id=c.shipping_zone_id
    JOIN public.shipping_zone_communes own ON own.commune_name_normalized=c.commune_name_normalized
    WHERE own.shipping_zone_id=NEW.shipping_zone_id AND z.state='ACTIVE'
      AND z.shipping_zone_id<>NEW.shipping_zone_id AND z.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'commune already belongs to an active zone' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER shipping_zone_activation_validated BEFORE UPDATE OF state ON shipping_zones
FOR EACH ROW EXECUTE FUNCTION sergod_validate_active_shipping_commune();

CREATE FUNCTION sergod_validate_active_shipping_option() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.state='ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM public.shipping_zones z
    WHERE z.shipping_zone_id=NEW.shipping_zone_id AND z.state='ACTIVE'
  ) THEN RAISE EXCEPTION 'active shipping option requires an active zone' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER shipping_option_activation_validated BEFORE INSERT OR UPDATE OF state,shipping_zone_id ON shipping_options
FOR EACH ROW EXECUTE FUNCTION sergod_validate_active_shipping_option();

CREATE TRIGGER content_revisions_immutable BEFORE UPDATE OR DELETE ON content_revisions
FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();
CREATE TRIGGER shipping_configuration_history_immutable BEFORE UPDATE OR DELETE ON shipping_configuration_history
FOR EACH ROW EXECUTE FUNCTION sergod_prevent_change();

ALTER TABLE public_service_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_zone_communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_configuration_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public_service_info,content_revisions,shipping_zones,shipping_zone_communes,shipping_options,shipping_configuration_history FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public_service_info,content_revisions,shipping_zones,shipping_zone_communes,shipping_options,shipping_configuration_history FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public_service_info,content_revisions,shipping_zones,shipping_zone_communes,shipping_options,shipping_configuration_history FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT ALL ON public_service_info,content_revisions,shipping_zones,shipping_zone_communes,shipping_options,shipping_configuration_history TO service_role; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION sergod_validate_public_service_info_revision(),sergod_validate_active_shipping_commune(),sergod_validate_active_shipping_option() FROM PUBLIC;
