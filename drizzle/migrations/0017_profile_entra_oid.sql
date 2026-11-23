ALTER TABLE public.profiles ADD COLUMN oid uuid UNIQUE;
COMMENT ON COLUMN public.profiles.oid IS 'Entra ID Object ID (SIGA key); set only from auth.identities';

CREATE OR REPLACE FUNCTION public.capture_entra_oid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_oid text := NEW.identity_data -> 'custom_claims' ->> 'oid';
BEGIN
  IF NEW.provider = 'azure'
     AND NEW.identity_data -> 'custom_claims' ->> 'tid' = 'a0207964-4191-4edd-b7f7-25f82b8f2b78'
     AND v_oid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.profiles SET oid = v_oid::uuid WHERE id = NEW.user_id AND oid IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_entra_oid() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER atlas_capture_entra_oid
AFTER INSERT OR UPDATE OF identity_data ON auth.identities
FOR EACH ROW EXECUTE FUNCTION public.capture_entra_oid();

UPDATE public.profiles p SET oid = (i.identity_data -> 'custom_claims' ->> 'oid')::uuid
FROM auth.identities i
WHERE i.user_id = p.id AND i.provider = 'azure' AND p.oid IS NULL
  AND i.identity_data -> 'custom_claims' ->> 'tid' = 'a0207964-4191-4edd-b7f7-25f82b8f2b78'
  AND i.identity_data -> 'custom_claims' ->> 'oid' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, active) ON public.profiles TO authenticated;