ALTER TABLE public.user_accounts
  ADD COLUMN konami_id text,
  ADD COLUMN klu_code text,
  ADD CONSTRAINT user_accounts_konami_id_ck CHECK (
    konami_id IS NULL OR (
      char_length(konami_id) BETWEEN 1 AND 64
      AND konami_id !~ '[^A-Za-z0-9._-]'
    )
  ),
  ADD CONSTRAINT user_accounts_klu_code_ck CHECK (
    klu_code IS NULL OR (
      char_length(klu_code) BETWEEN 1 AND 64
      AND klu_code !~ '[^A-Za-z0-9._-]'
    )
  );

COMMENT ON COLUMN public.user_accounts.konami_id IS
  'Optional customer identifier for in-person tournaments; never required for purchase.';
COMMENT ON COLUMN public.user_accounts.klu_code IS
  'Optional customer code for in-person tournaments; never required for purchase.';
