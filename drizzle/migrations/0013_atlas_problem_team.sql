CREATE FUNCTION public.problem_team(p_problem_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.problems;
BEGIN
  IF NOT public.has_problem_access(p_problem_id) THEN RAISE EXCEPTION 'Sem acesso ao problema'; END IF;
  SELECT * INTO STRICT p FROM public.problems WHERE id=p_problem_id;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'full_name',pr.full_name,'role',r.role) ORDER BY pr.full_name)
    FROM public.profiles pr JOIN public.user_roles r ON r.user_id=pr.id
    WHERE pr.active AND r.role IN ('analyst','kam','ops_manager') AND (p.account_id IS NULL OR public.user_has_account_access(pr.id,p.account_id))),'[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.problem_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.problem_team(uuid) TO authenticated, service_role;