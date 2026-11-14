CREATE FUNCTION public.staff_names(p_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Internal staff can see colleagues' display names (never e-mails) to read histories and assignments.
  IF public.current_app_role() IS NULL THEN RAISE EXCEPTION 'Sem perfil de acesso'; END IF;
  IF coalesce(array_length(p_ids,1),0)>200 THEN RAISE EXCEPTION 'Consulta muito grande'; END IF;
  RETURN coalesce((SELECT jsonb_object_agg(p.id,p.full_name) FROM public.profiles p WHERE p.id=ANY(p_ids)),'{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_names(uuid[]) TO authenticated, service_role;