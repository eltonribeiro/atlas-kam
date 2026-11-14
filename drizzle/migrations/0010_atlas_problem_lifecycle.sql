CREATE TABLE public.problem_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('status_change','effectiveness','link','owner','system')),
  author_id uuid REFERENCES public.profiles(id),
  body text,
  from_status public.problem_status,
  to_status public.problem_status,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX problem_events_problem ON public.problem_events (problem_id, created_at DESC);
GRANT SELECT ON public.problem_events TO authenticated;
GRANT ALL ON public.problem_events TO service_role;
ALTER TABLE public.problem_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY problem_events_read ON public.problem_events FOR SELECT TO authenticated USING (public.has_problem_access(problem_id));
CREATE TRIGGER immutable_problem_events BEFORE UPDATE OR DELETE ON public.problem_events FOR EACH ROW EXECUTE FUNCTION public.reject_event_mutation();

ALTER TABLE public.problems ADD COLUMN effectiveness_evidence text;
ALTER TABLE public.problems ADD COLUMN effectiveness_checked_at timestamptz;
ALTER TABLE public.problems ADD COLUMN created_by uuid REFERENCES public.profiles(id);

DROP POLICY IF EXISTS problems_write ON public.problems;
REVOKE INSERT, UPDATE, DELETE ON public.problems FROM authenticated;

CREATE POLICY profiles_staff_read ON public.profiles FOR SELECT TO authenticated USING (public.current_app_role() IS NOT NULL);

CREATE FUNCTION public.can_manage_problem(p_problem_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_problem_access(p_problem_id) AND coalesce(public.current_app_role() IN ('kam','ops_manager'),false)
$$;

CREATE FUNCTION public.fail_problem_effectiveness(p_problem_id uuid, p_reason text, p_occurrence_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.problems;
BEGIN
  SELECT * INTO STRICT p FROM public.problems WHERE id=p_problem_id FOR UPDATE;
  IF p.status<>'effectiveness_check' THEN RETURN; END IF;
  UPDATE public.problems SET status='analysis',effectiveness_effective=false,effectiveness_checked_at=now(),effectiveness_evidence=p_reason WHERE id=p.id;
  INSERT INTO public.problem_events(problem_id,kind,author_id,body,from_status,to_status,metadata)
    VALUES(p.id,'effectiveness',auth.uid(),p_reason,'effectiveness_check','analysis',jsonb_build_object('effective',false,'automatic',p_occurrence_id IS NOT NULL,'occurrence_id',p_occurrence_id));
  PERFORM public.notify_user(p.owner_id,p_occurrence_id,p.id,'effectiveness_failed','Eficácia reprovada · '||p.code,p_reason,'effectiveness_failed_'||p.id||'_'||floor(extract(epoch FROM clock_timestamp())*1000)::bigint,true);
END $$;

CREATE FUNCTION public.link_occurrence_to_problem(p_occurrence_id uuid, p_problem_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; p public.problems;
BEGIN
  IF NOT public.has_occurrence_access(p_occurrence_id) OR NOT public.can_manage_problem(p_problem_id) THEN RAISE EXCEPTION 'Somente KAM ou gestor com acesso pode vincular a um problema'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  SELECT * INTO STRICT p FROM public.problems WHERE id=p_problem_id FOR UPDATE;
  IF p.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'O problema já foi encerrado'; END IF;
  IF p.account_id IS NOT NULL AND p.account_id<>o.account_id THEN RAISE EXCEPTION 'O problema pertence a outra conta'; END IF;
  IF o.problem_id IS NOT NULL THEN RAISE EXCEPTION 'A ocorrência já está vinculada a um problema'; END IF;
  UPDATE public.occurrences SET problem_id=p.id,updated_at=now() WHERE id=o.id;
  UPDATE public.causes SET problem_id=p.id WHERE occurrence_id=o.id AND problem_id IS NULL;
  UPDATE public.actions SET problem_id=p.id WHERE occurrence_id=o.id AND problem_id IS NULL AND type IN ('corrective','preventive');
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata) VALUES(o.id,'system','internal',auth.uid(),'Vinculada ao problema '||p.code||' · '||p.title||'.',jsonb_build_object('action','link_problem','problem_id',p.id));
  INSERT INTO public.problem_events(problem_id,kind,author_id,body,metadata) VALUES(p.id,'link',auth.uid(),'Ocorrência '||o.protocol||' vinculada.',jsonb_build_object('occurrence_id',o.id));
  IF p.status='effectiveness_check' THEN
    PERFORM public.fail_problem_effectiveness(p.id,'Nova ocorrência da mesma causa durante a verificação: '||o.protocol||'.',o.id);
  END IF;
END $$;

CREATE FUNCTION public.create_problem(p_title text, p_account_id uuid, p_category_id uuid, p_occurrence_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; code text;
BEGIN
  IF coalesce(public.current_app_role() NOT IN ('kam','ops_manager'),true) THEN RAISE EXCEPTION 'Somente KAM ou gestor pode criar problemas'; END IF;
  IF p_account_id IS NULL AND public.current_app_role()<>'ops_manager' THEN RAISE EXCEPTION 'Somente o gestor cria problemas entre contas'; END IF;
  IF p_account_id IS NOT NULL AND NOT public.has_account_access(p_account_id) THEN RAISE EXCEPTION 'Sem acesso à conta'; END IF;
  IF length(trim(coalesce(p_title,''))) NOT BETWEEN 5 AND 140 THEN RAISE EXCEPTION 'O título deve ter de 5 a 140 caracteres'; END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories WHERE id=p_category_id AND parent_id IS NULL) THEN RAISE EXCEPTION 'Categoria inválida'; END IF;
  INSERT INTO public.problems(code,title,account_id,category_id,status,created_by) VALUES('pending',trim(p_title),p_account_id,p_category_id,'open',auth.uid()) RETURNING id,problems.code INTO pid,code;
  INSERT INTO public.problem_events(problem_id,kind,author_id,body,to_status) VALUES(pid,'status_change',auth.uid(),'Problema '||code||' criado.','open');
  IF p_occurrence_id IS NOT NULL THEN PERFORM public.link_occurrence_to_problem(p_occurrence_id,pid); END IF;
  RETURN pid;
END $$;

CREATE FUNCTION public.available_problem_transitions(p_problem_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.problems; manage boolean; root_ok boolean; pending_actions integer; total_actions integer; result jsonb:='[]'::jsonb; today date;
BEGIN
  IF NOT public.has_problem_access(p_problem_id) THEN RAISE EXCEPTION 'Sem acesso ao problema'; END IF;
  SELECT * INTO STRICT p FROM public.problems WHERE id=p_problem_id;
  manage:=public.can_manage_problem(p.id);
  IF NOT manage THEN RETURN result; END IF;
  today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF p.status='open' THEN
    result:=result||jsonb_build_array(jsonb_build_object('action','start_analysis','label','Iniciar análise','effect','Vai para Em análise.','allowed',p.owner_id IS NOT NULL,
      'conditions',jsonb_build_array(jsonb_build_object('label','Dono definido','met',p.owner_id IS NOT NULL))));
  END IF;
  IF p.status='analysis' THEN
    root_ok:=EXISTS(SELECT 1 FROM public.causes WHERE problem_id=p.id AND kind='root' AND status='confirmed');
    result:=result||jsonb_build_array(jsonb_build_object('action','plan_actions','label','Definir plano de ação','effect','Vai para Plano de ação.','allowed',root_ok,
      'conditions',jsonb_build_array(jsonb_build_object('label','Ao menos uma causa raiz confirmada','met',root_ok))));
  END IF;
  IF p.status='action_plan' THEN
    SELECT count(*) FILTER (WHERE status NOT IN ('done','cancelled')),count(*) FILTER (WHERE status<>'cancelled') INTO pending_actions,total_actions FROM public.actions WHERE problem_id=p.id AND type IN ('corrective','preventive');
    result:=result||jsonb_build_array(jsonb_build_object('action','start_verification','label','Iniciar verificação de eficácia','effect','Vai para Verificação de eficácia com critério e data.','allowed',total_actions>0 AND pending_actions=0,
      'conditions',jsonb_build_array(jsonb_build_object('label','Ações corretivas e preventivas cadastradas','met',total_actions>0),jsonb_build_object('label','Todas as ações corretivas e preventivas concluídas','met',total_actions>0 AND pending_actions=0))));
  END IF;
  IF p.status='effectiveness_check' THEN
    result:=result||jsonb_build_array(jsonb_build_object('action','record_effectiveness','label','Registrar resultado da eficácia','effect','Efetiva encerra o problema; não efetiva volta para Em análise.','allowed',true,
      'conditions',jsonb_build_array(jsonb_build_object('label','Resultado "Efetiva" a partir de '||to_char(p.effectiveness_due_date,'DD/MM/YYYY'),'met',today>=p.effectiveness_due_date))));
  END IF;
  IF p.status NOT IN ('closed','cancelled') THEN
    result:=result||jsonb_build_array(jsonb_build_object('action','cancel','label','Cancelar problema','effect','Encerra sem verificação; o histórico é mantido.','allowed',true,'conditions','[]'::jsonb));
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.transition_problem(p_problem_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.problems; target public.problem_status; allowed boolean; body text; criteria text; due date; effective boolean; today date;
BEGIN
  IF NOT public.can_manage_problem(p_problem_id) THEN RAISE EXCEPTION 'Somente KAM ou gestor com acesso pode alterar o problema'; END IF;
  SELECT * INTO STRICT p FROM public.problems WHERE id=p_problem_id FOR UPDATE;
  body:=trim(coalesce(p_payload->>'body',''));
  today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF p_action='assign_owner' THEN
    IF p.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'Problema encerrado'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.profiles pr JOIN public.user_roles r ON r.user_id=pr.id WHERE pr.id=(p_payload->>'owner_id')::uuid AND pr.active AND r.role IN ('kam','ops_manager'))
       OR (p.account_id IS NOT NULL AND NOT public.user_has_account_access((p_payload->>'owner_id')::uuid,p.account_id)) THEN
      RAISE EXCEPTION 'O dono deve ser KAM ou gestor com acesso à conta';
    END IF;
    UPDATE public.problems SET owner_id=(p_payload->>'owner_id')::uuid WHERE id=p.id;
    INSERT INTO public.problem_events(problem_id,kind,author_id,body,metadata) VALUES(p.id,'owner',auth.uid(),'Dono definido: '||(SELECT full_name FROM public.profiles WHERE id=(p_payload->>'owner_id')::uuid)||'.',jsonb_build_object('owner_id',p_payload->>'owner_id'));
    PERFORM public.notify_user((p_payload->>'owner_id')::uuid,NULL,p.id,'problem_owner','Você é dono do problema '||p.code,p.title,'problem_owner_'||p.id||'_'||floor(extract(epoch FROM clock_timestamp())*1000)::bigint,true);
    RETURN jsonb_build_object('status',p.status);
  END IF;
  SELECT coalesce((v->>'allowed')::boolean,false) INTO allowed FROM jsonb_array_elements(public.available_problem_transitions(p.id)) v WHERE v->>'action'=p_action;
  IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Transição não permitida ou condições pendentes'; END IF;
  CASE p_action
  WHEN 'start_analysis' THEN target:='analysis';
  WHEN 'plan_actions' THEN target:='action_plan';
  WHEN 'start_verification' THEN
    criteria:=trim(coalesce(p_payload->>'criteria',''));
    BEGIN due:=(p_payload->>'due_date')::date; EXCEPTION WHEN others THEN due:=NULL; END;
    IF length(criteria)<10 OR criteria !~ '[0-9]' THEN RAISE EXCEPTION 'O critério de eficácia deve ser mensurável e conter número ou percentual'; END IF;
    IF due IS NULL OR due<=today THEN RAISE EXCEPTION 'Defina uma data futura para a verificação de eficácia'; END IF;
    UPDATE public.problems SET effectiveness_criteria=criteria,effectiveness_due_date=due,effectiveness_effective=NULL,effectiveness_evidence=NULL,effectiveness_checked_at=NULL WHERE id=p.id;
    body:='Critério: '||criteria||' · verificar em '||to_char(due,'DD/MM/YYYY')||'.';
    target:='effectiveness_check';
  WHEN 'record_effectiveness' THEN
    effective:=(p_payload->>'effective')::boolean;
    IF effective IS NULL OR length(body)<10 THEN RAISE EXCEPTION 'Informe o resultado e a evidência da verificação'; END IF;
    IF effective AND today<p.effectiveness_due_date THEN RAISE EXCEPTION 'A eficácia só pode ser confirmada a partir da data de verificação'; END IF;
    IF NOT effective THEN PERFORM public.fail_problem_effectiveness(p.id,body,NULL); RETURN jsonb_build_object('status','analysis'); END IF;
    UPDATE public.problems SET effectiveness_effective=true,effectiveness_evidence=body,effectiveness_checked_at=now(),closed_at=now() WHERE id=p.id;
    target:='closed';
  WHEN 'cancel' THEN
    IF length(body)<10 THEN RAISE EXCEPTION 'Descreva o motivo do cancelamento com pelo menos 10 caracteres'; END IF;
    UPDATE public.problems SET closed_at=now() WHERE id=p.id;
    target:='cancelled';
  ELSE RAISE EXCEPTION 'Ação inválida';
  END CASE;
  UPDATE public.problems SET status=target WHERE id=p.id;
  INSERT INTO public.problem_events(problem_id,kind,author_id,body,from_status,to_status,metadata)
    VALUES(p.id,CASE WHEN p_action='record_effectiveness' THEN 'effectiveness' ELSE 'status_change' END,auth.uid(),nullif(body,''),p.status,target,jsonb_build_object('action',p_action));
  RETURN jsonb_build_object('status',target);
END $$;

CREATE FUNCTION public.occurrence_recurrence(p_occurrence_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; same_account integer; same_category integer; problems jsonb;
BEGIN
  IF NOT public.has_occurrence_access(p_occurrence_id) THEN RAISE EXCEPTION 'Sem acesso à ocorrência'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id;
  SELECT count(*) INTO same_account FROM public.occurrences WHERE account_id=o.account_id AND category_id=o.category_id AND type IN ('complaint','incident') AND created_at>=now()-interval '90 days';
  SELECT count(*) INTO same_category FROM public.occurrences WHERE category_id=o.category_id AND type IN ('complaint','incident') AND created_at>=now()-interval '90 days';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'title',p.title,'status',p.status) ORDER BY p.created_at DESC),'[]'::jsonb) INTO problems
    FROM public.problems p WHERE p.status NOT IN ('closed','cancelled') AND (p.account_id=o.account_id OR (p.account_id IS NULL AND public.current_app_role()='ops_manager')) AND (p.category_id IS NULL OR p.category_id=o.category_id);
  RETURN jsonb_build_object('same_account_90d',same_account,'same_category_90d',same_category,'suggest',o.type IN ('complaint','incident') AND (same_account>=3 OR same_category>=5),'open_problems',problems);
END $$;

CREATE OR REPLACE FUNCTION public.after_occurrence_registered() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.accounts; same_account integer; same_category integer; label text; cat text; prob public.problems;
BEGIN
  SELECT * INTO STRICT a FROM public.accounts WHERE id=NEW.account_id;
  label:=CASE NEW.severity WHEN 'S1' THEN 'S1 · Crítica' WHEN 'S2' THEN 'S2 · Alta' WHEN 'S3' THEN 'S3 · Média' ELSE 'S4 · Baixa' END;
  PERFORM public.enqueue_customer_email(NEW.id,'occurrence-registered',
    jsonb_build_object('headline','Recebemos sua ocorrência','message','Primeira resposta prevista até '||public.sp_datetime(NEW.first_response_due_at)||'.','severityLabel',label,'firstResponseDue',public.sp_datetime(NEW.first_response_due_at)),
    'E-mail de confirmação da abertura ao contato','opening-'||NEW.id,NULL,true);
  IF NEW.type IN ('complaint','incident') THEN
    SELECT name INTO cat FROM public.categories WHERE id=NEW.category_id;
    SELECT count(*) INTO same_account FROM public.occurrences WHERE account_id=NEW.account_id AND category_id=NEW.category_id AND type IN ('complaint','incident') AND created_at>=now()-interval '90 days';
    IF same_account>=3 AND a.kam_id IS NOT NULL THEN
      PERFORM public.notify_user(a.kam_id,NEW.id,NULL,'recurrence','Recorrência · '||a.name,same_account||' ocorrências de '||cat||' em 90 dias. Avalie vincular a um problema.','recurrence_'||NEW.id,false);
    END IF;
    SELECT count(*) INTO same_category FROM public.occurrences WHERE category_id=NEW.category_id AND type IN ('complaint','incident') AND created_at>=now()-interval '90 days';
    IF same_category>=5 THEN
      PERFORM public.notify_ops_managers(NEW.id,NULL,'recurrence','Recorrência entre contas · '||cat,same_category||' ocorrências desta categoria em 90 dias, considerando todas as contas.','recurrence_category_'||NEW.id,false);
    END IF;
    SELECT * INTO prob FROM public.problems WHERE status='effectiveness_check' AND category_id=NEW.category_id AND (account_id IS NULL OR account_id=NEW.account_id) ORDER BY (account_id IS NULL), created_at DESC LIMIT 1 FOR UPDATE;
    IF prob.id IS NOT NULL THEN
      UPDATE public.occurrences SET problem_id=prob.id WHERE id=NEW.id;
      INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,metadata) VALUES(NEW.id,'system','internal','Vinculada automaticamente ao problema '||prob.code||', em verificação de eficácia para a mesma conta e categoria.',jsonb_build_object('action','link_problem','problem_id',prob.id,'automatic',true));
      INSERT INTO public.problem_events(problem_id,kind,body,metadata) VALUES(prob.id,'link','Ocorrência '||NEW.protocol||' vinculada automaticamente.',jsonb_build_object('occurrence_id',NEW.id,'automatic',true));
      PERFORM public.fail_problem_effectiveness(prob.id,'Nova ocorrência da mesma causa durante a verificação: '||NEW.protocol||'.',NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fail_problem_effectiveness(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_problem_effectiveness(uuid,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.can_manage_problem(uuid), public.link_occurrence_to_problem(uuid,uuid), public.create_problem(text,uuid,uuid,uuid),
  public.available_problem_transitions(uuid), public.transition_problem(uuid,text,jsonb), public.occurrence_recurrence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_problem(uuid), public.link_occurrence_to_problem(uuid,uuid), public.create_problem(text,uuid,uuid,uuid),
  public.available_problem_transitions(uuid), public.transition_problem(uuid,text,jsonb), public.occurrence_recurrence(uuid) TO authenticated, service_role;