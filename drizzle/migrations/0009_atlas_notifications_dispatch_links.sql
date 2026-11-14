REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON FUNCTION public.sla_tick() FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.sla_tick() TO service_role;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  occurrence_id uuid REFERENCES public.occurrences(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES public.problems(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notifications_user_recent ON public.notifications (user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  UPDATE public.notifications SET read_at=now() WHERE user_id=auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id=ANY(p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE TABLE public.email_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid REFERENCES public.occurrences(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES public.problems(id) ON DELETE CASCADE,
  template text NOT NULL,
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('contact','user')),
  contact_id uuid REFERENCES public.account_contacts(id),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  link_purpose text CHECK (link_purpose IN ('evaluation','contestation')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','retry','sent','failed','suppressed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CHECK ((recipient_kind='contact' AND contact_id IS NOT NULL AND user_id IS NULL) OR (recipient_kind='user' AND user_id IS NOT NULL AND contact_id IS NULL)),
  CHECK (link_purpose IS NULL OR recipient_kind='contact')
);
CREATE INDEX email_dispatches_due ON public.email_dispatches (next_attempt_at) WHERE status IN ('pending','retry','sending');
CREATE INDEX email_dispatches_occurrence ON public.email_dispatches (occurrence_id, created_at);
GRANT SELECT ON public.email_dispatches TO authenticated;
GRANT ALL ON public.email_dispatches TO service_role;
ALTER TABLE public.email_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY dispatches_customer_read ON public.email_dispatches FOR SELECT TO authenticated USING (recipient_kind='contact' AND occurrence_id IS NOT NULL AND public.has_occurrence_access(occurrence_id));

CREATE TABLE public.public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('evaluation','contestation')),
  occurrence_id uuid NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  dispatch_id uuid REFERENCES public.email_dispatches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose='evaluation' AND evaluation_id IS NOT NULL) OR (purpose='contestation' AND evaluation_id IS NULL AND expires_at IS NOT NULL))
);
CREATE INDEX public_links_occurrence ON public.public_links (occurrence_id);
GRANT ALL ON public.public_links TO service_role;
ALTER TABLE public.public_links ENABLE ROW LEVEL SECURITY;
INSERT INTO public.public_links(purpose,occurrence_id,evaluation_id,token_hash,created_at)
  SELECT 'evaluation',occurrence_id,id,token_hash,sent_at FROM public.evaluations WHERE token_hash ~ '^[0-9a-f]{64}$'
  ON CONFLICT (token_hash) DO NOTHING;

CREATE FUNCTION public.register_evaluation_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.public_links(purpose,occurrence_id,evaluation_id,token_hash) VALUES('evaluation',NEW.occurrence_id,NEW.id,NEW.token_hash) ON CONFLICT (token_hash) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER evaluation_link_registry AFTER INSERT ON public.evaluations FOR EACH ROW EXECUTE FUNCTION public.register_evaluation_link();

CREATE FUNCTION public.sp_datetime(p timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT CASE WHEN p IS NULL THEN '—' ELSE to_char(p AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI') END
$$;

CREATE FUNCTION public.user_has_account_access(p_user uuid, p_account uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
    WHERE p.id=p_user AND p.active AND (r.role IN ('ops_manager','admin') OR EXISTS(SELECT 1 FROM public.account_members m WHERE m.user_id=p.id AND m.account_id=p_account)))
$$;

CREATE FUNCTION public.notify_user(p_user uuid, p_occurrence uuid, p_problem uuid, p_kind text, p_title text, p_body text, p_key text, p_email boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; target_path text;
BEGIN
  IF p_user IS NULL OR p_user IS NOT DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND active) THEN RETURN false; END IF;
  INSERT INTO public.notifications(user_id,occurrence_id,problem_id,kind,title,body,dedupe_key)
    VALUES(p_user,p_occurrence,p_problem,p_kind,p_title,p_body,p_key) ON CONFLICT (user_id,dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n>0 AND p_email THEN
    target_path:=CASE WHEN p_occurrence IS NOT NULL THEN '/ocorrencias/'||p_occurrence ELSE '/problemas/'||p_problem END;
    INSERT INTO public.email_dispatches(occurrence_id,problem_id,template,recipient_kind,user_id,data,summary,idempotency_key)
      VALUES(p_occurrence,p_problem,'internal-alert','user',p_user,jsonb_build_object('title',p_title,'body',coalesce(p_body,''),'path',target_path),'Alerta interno: '||p_title,'alert-'||p_user||'-'||p_key)
      ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN n>0;
END $$;

CREATE FUNCTION public.notify_ops_managers(p_occurrence uuid, p_problem uuid, p_kind text, p_title text, p_body text, p_key text, p_email boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m uuid; total integer:=0;
BEGIN
  FOR m IN SELECT r.user_id FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.role='ops_manager' AND p.active LOOP
    IF public.notify_user(m,p_occurrence,p_problem,p_kind,p_title,p_body,p_key,p_email) THEN total:=total+1; END IF;
  END LOOP;
  RETURN total;
END $$;

CREATE FUNCTION public.enqueue_customer_email(p_occurrence uuid, p_template text, p_data jsonb, p_summary text, p_key text, p_link text DEFAULT NULL, p_copy_kam boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; c public.account_contacts; payload jsonb;
BEGIN
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence;
  SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
  SELECT * INTO STRICT c FROM public.account_contacts WHERE id=o.contact_id;
  payload:=jsonb_build_object('protocol',o.protocol,'subject',o.subject,'accountName',a.name,'contactName',c.name)||coalesce(p_data,'{}'::jsonb);
  INSERT INTO public.email_dispatches(occurrence_id,template,recipient_kind,contact_id,link_purpose,data,summary,idempotency_key)
    VALUES(o.id,p_template,'contact',c.id,p_link,payload,p_summary,p_key) ON CONFLICT (idempotency_key) DO NOTHING;
  IF p_copy_kam AND a.kam_id IS NOT NULL THEN
    INSERT INTO public.email_dispatches(occurrence_id,template,recipient_kind,user_id,data,summary,idempotency_key)
      VALUES(o.id,'kam-copy','user',a.kam_id,payload||jsonb_build_object('originalTemplate',p_template,'hasLink',p_link IS NOT NULL,'path','/ocorrencias/'||o.id),'Cópia ao KAM: '||p_summary,p_key||'-kam')
      ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END $$;

CREATE FUNCTION public.after_occurrence_registered() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.accounts; same_account integer; same_category integer; label text; cat text;
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
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER occurrence_registered_notifications AFTER INSERT ON public.occurrences FOR EACH ROW EXECUTE FUNCTION public.after_occurrence_registered();

CREATE OR REPLACE FUNCTION public.communicate_occurrence(p_occurrence_id uuid, p_kind event_kind, p_body text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; t public.sla_targets; ev uuid;
BEGIN
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF NOT public.can_manage_work(o.id,NULL) OR p_kind NOT IN ('customer_update','internal_note') OR length(trim(coalesce(p_body,'')))=0 THEN RAISE EXCEPTION 'Comunicação não permitida'; END IF;
  IF p_kind='customer_update' AND o.status IN ('closed_resolved','closed_no_evaluation','closed_unfounded') THEN RAISE EXCEPTION 'Ocorrência encerrada: registre uma nota interna'; END IF;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body)
    VALUES(o.id,p_kind,CASE WHEN p_kind='internal_note' THEN 'internal'::public.event_visibility ELSE 'customer'::public.event_visibility END,auth.uid(),trim(p_body)) RETURNING id INTO ev;
  IF p_kind='customer_update' THEN
    SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
    SELECT * INTO STRICT t FROM public.sla_targets WHERE policy_id=a.sla_policy_id AND severity=o.severity;
    UPDATE public.occurrences SET first_response_at=coalesce(first_response_at,now()),
      first_response_breached=first_response_breached OR (first_response_at IS NULL AND now()>first_response_due_at),
      next_update_due_at=public.add_business_minutes(a.calendar_id,now(),t.update_interval_minutes) WHERE id=o.id;
    PERFORM public.enqueue_customer_email(o.id,'customer-update',jsonb_build_object('headline','Atualização da sua ocorrência','message',trim(p_body)),'E-mail de atualização ao contato','update-'||ev,NULL,true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.transition_occurrence(p_occurrence_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; t public.sla_targets; target public.occ_status; body text; allowed boolean; paused integer; ev uuid;
BEGIN
  IF NOT public.has_occurrence_access(p_occurrence_id) THEN RAISE EXCEPTION 'Sem acesso à ocorrência'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  SELECT coalesce((v->>'allowed')::boolean,false) INTO allowed FROM jsonb_array_elements(public.available_transitions(o.id)) v WHERE v->>'action'=p_action;
  IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'Transição não permitida ou condições pendentes'; END IF;
  SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
  SELECT * INTO STRICT t FROM public.sla_targets WHERE policy_id=a.sla_policy_id AND severity=o.severity;
  body:=trim(coalesce(p_payload->>'body',''));
  target:=o.status;
  CASE p_action
  WHEN 'confirm_classification' THEN
    UPDATE public.occurrences SET classification_confirmed_at=now(),classification_confirmed_by=auth.uid() WHERE id=o.id;
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata) VALUES(o.id,'system','system',auth.uid(),'Severidade e categoria confirmadas.',jsonb_build_object('severity',o.severity,'category_id',o.category_id));
    RETURN jsonb_build_object('status',o.status);
  WHEN 'change_classification' THEN RAISE EXCEPTION 'Use a revisão de classificação';
  WHEN 'assume' THEN target:='in_analysis'; UPDATE public.occurrences SET assignee_id=auth.uid() WHERE id=o.id;
  WHEN 'start_treatment' THEN target:='in_treatment';
  WHEN 'ask_customer' THEN
    IF body='' THEN RAISE EXCEPTION 'Informe a pergunta ao cliente'; END IF;
    target:='awaiting_customer';
    UPDATE public.occurrences SET paused_since=now(),paused_from_status=o.status,first_response_at=coalesce(first_response_at,now()),
      first_response_breached=first_response_breached OR (first_response_at IS NULL AND now()>first_response_due_at),
      resolution_breached=resolution_breached OR now()>resolution_due_at,
      next_update_due_at=public.add_business_minutes(a.calendar_id,now(),t.update_interval_minutes) WHERE id=o.id;
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata) VALUES(o.id,'customer_question','customer',auth.uid(),body,jsonb_build_object('previous_status',o.status)) RETURNING id INTO ev;
    PERFORM public.enqueue_customer_email(o.id,'customer-question',jsonb_build_object('headline','Precisamos de uma informação','message',body),'E-mail com a pergunta ao contato','question-'||ev,NULL,true);
  WHEN 'customer_replied' THEN
    IF body='' THEN RAISE EXCEPTION 'Informe a resposta recebida'; END IF;
    IF o.paused_since IS NULL THEN RAISE EXCEPTION 'Pausa inconsistente'; END IF;
    target:=o.paused_from_status;
    IF target IS NULL THEN SELECT (metadata->>'previous_status')::public.occ_status INTO target FROM public.occurrence_events WHERE occurrence_id=o.id AND kind='customer_question' ORDER BY created_at DESC,id DESC LIMIT 1; END IF;
    IF target IS NULL OR target NOT IN ('in_analysis','in_treatment','reopened') THEN RAISE EXCEPTION 'Estado anterior da pausa indisponível'; END IF;
    paused:=public.business_minutes_between(a.calendar_id,o.paused_since,now());
    UPDATE public.occurrences SET paused_business_minutes=paused_business_minutes+paused,paused_since=NULL,paused_from_status=NULL,
      resolution_due_at=public.add_business_minutes(a.calendar_id,o.resolution_started_at,t.resolution_minutes+o.paused_business_minutes+paused),
      next_update_due_at=CASE WHEN o.next_update_due_at IS NULL THEN NULL ELSE public.add_business_minutes(a.calendar_id,o.next_update_due_at,paused) END WHERE id=o.id;
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata) VALUES(o.id,'customer_reply','internal',auth.uid(),body,jsonb_build_object('paused_business_minutes',paused));
  WHEN 'propose_solution' THEN
    IF length(body)<20 THEN RAISE EXCEPTION 'Descreva a solução com pelo menos 20 caracteres'; END IF;
    target:='solution_proposed';
    UPDATE public.occurrences SET solution_text=body,solution_proposed_at=now(),resolution_breached=resolution_breached OR now()>resolution_due_at WHERE id=o.id;
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body) VALUES(o.id,'solution','customer',auth.uid(),body);
    PERFORM public.enqueue_customer_email(o.id,'solution-evaluation',jsonb_build_object('headline','Solução da sua ocorrência','message',body,'expectation',o.customer_expectation),'E-mail de solução e pesquisa ao contato','solution-'||o.id||'-c'||(o.reopen_count+1),'evaluation',true);
  WHEN 'mark_unfounded' THEN
    IF length(body)<30 THEN RAISE EXCEPTION 'Justifique com pelo menos 30 caracteres'; END IF;
    target:='closed_unfounded';
    UPDATE public.occurrences SET unfounded_justification=body,closed_at=now() WHERE id=o.id;
    PERFORM public.enqueue_customer_email(o.id,'unfounded-notice',jsonb_build_object('headline','Análise da sua ocorrência concluída','message',body),'E-mail de improcedência com link de contestação ao contato','unfounded-'||o.id||'-c'||(o.reopen_count+1),'contestation',true);
  ELSE RAISE EXCEPTION 'Ação inválida';
  END CASE;
  UPDATE public.occurrences SET status=target,updated_at=now() WHERE id=o.id;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,from_status,to_status) VALUES(o.id,'status_change','system',auth.uid(),nullif(body,''),o.status,target);
  RETURN jsonb_build_object('status',target);
END $$;

CREATE OR REPLACE FUNCTION public.reopen_occurrence_from_customer(p_occurrence_id uuid, p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; t public.sla_targets; k text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Reabertura exclusiva do cliente por avaliação validada'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF length(trim(coalesce(p_reason,'')))=0 OR o.status NOT IN ('solution_proposed','closed_resolved','closed_no_evaluation') THEN RAISE EXCEPTION 'Reabertura não permitida'; END IF;
  IF o.status<>'solution_proposed' AND (o.closed_at IS NULL OR now()>o.closed_at+interval '15 days') THEN RAISE EXCEPTION 'Prazo de reabertura encerrado'; END IF;
  SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
  SELECT * INTO STRICT t FROM public.sla_targets WHERE policy_id=a.sla_policy_id AND severity=o.severity;
  UPDATE public.occurrences SET status='reopened',reopen_count=reopen_count+1,resolution_started_at=now(),
    resolution_due_at=public.add_business_minutes(a.calendar_id,now(),t.resolution_minutes),paused_business_minutes=0,paused_since=NULL,paused_from_status=NULL,
    solution_proposed_at=NULL,closed_at=NULL,next_update_due_at=public.add_business_minutes(a.calendar_id,now(),t.update_interval_minutes),updated_at=now() WHERE id=o.id;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,from_status,to_status,metadata) VALUES(o.id,'evaluation','customer',trim(p_reason),o.status,'reopened',jsonb_build_object('cycle',o.reopen_count+2));
  k:='reopen_'||o.id||'_c'||(o.reopen_count+2);
  PERFORM public.notify_user(o.assignee_id,o.id,NULL,'reopened','Reaberta pelo cliente · '||o.protocol,'O que falta resolver: '||trim(p_reason),k,true);
  IF a.kam_id IS DISTINCT FROM o.assignee_id THEN
    PERFORM public.notify_user(a.kam_id,o.id,NULL,'reopened','Reaberta pelo cliente · '||o.protocol,'O que falta resolver: '||trim(p_reason),k,true);
  END IF;
  RETURN jsonb_build_object('status','reopened','cycle',o.reopen_count+2);
END $$;

CREATE OR REPLACE FUNCTION public.answer_customer_evaluation(p_hash text, p_resolved eval_resolved, p_csat integer, p_ces integer, p_missing text, p_comment text, p_reopen boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.evaluations; o public.occurrences; kam uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT ev.* INTO e FROM public.public_links l JOIN public.evaluations ev ON ev.id=l.evaluation_id WHERE l.token_hash=p_hash AND l.purpose='evaluation' FOR UPDATE OF ev;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Link inválido ou expirado'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=e.occurrence_id FOR UPDATE;
  IF e.cycle<>o.reopen_count+1 THEN RAISE EXCEPTION 'Link inválido ou expirado'; END IF;
  IF p_reopen THEN
    IF o.status NOT IN ('closed_resolved','closed_no_evaluation') OR o.closed_at IS NULL OR now()>o.closed_at+interval '15 days' OR length(trim(coalesce(p_missing,'')))=0 THEN RAISE EXCEPTION 'Link inválido ou expirado'; END IF;
    RETURN public.reopen_occurrence_from_customer(o.id,p_missing);
  END IF;
  IF e.answered_at IS NOT NULL OR now()>e.token_expires_at OR o.status<>'solution_proposed' THEN RAISE EXCEPTION 'Link inválido ou expirado'; END IF;
  IF p_resolved IS NULL OR p_csat IS NULL OR p_csat NOT BETWEEN 1 AND 5 OR p_ces IS NULL OR p_ces NOT BETWEEN 1 AND 7 OR length(coalesce(p_comment,''))>1000
     OR (p_resolved IN ('partial','no') AND length(trim(coalesce(p_missing,'')))=0) THEN RAISE EXCEPTION 'Resposta incompleta'; END IF;
  UPDATE public.evaluations SET answered_at=now(),resolved=p_resolved,csat=p_csat,ces=p_ces,missing_text=p_missing,comment=p_comment WHERE id=e.id;
  IF p_resolved='yes' THEN
    UPDATE public.occurrences SET status='closed_resolved',closed_at=now(),updated_at=now() WHERE id=o.id;
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,from_status,to_status) VALUES(o.id,'evaluation','customer','Cliente confirmou a solução',o.status,'closed_resolved');
    SELECT kam_id INTO kam FROM public.accounts WHERE id=o.account_id;
    PERFORM public.notify_user(o.assignee_id,o.id,NULL,'evaluation','Solução confirmada · '||o.protocol,'CSAT '||p_csat||' · CES '||p_ces,'evaluation_'||e.id,false);
    IF kam IS DISTINCT FROM o.assignee_id THEN PERFORM public.notify_user(kam,o.id,NULL,'evaluation','Solução confirmada · '||o.protocol,'CSAT '||p_csat||' · CES '||p_ces,'evaluation_'||e.id,false); END IF;
    RETURN jsonb_build_object('status','closed_resolved');
  END IF;
  RETURN public.reopen_occurrence_from_customer(o.id,p_missing);
END $$;

CREATE OR REPLACE FUNCTION public.submit_unfounded_contestation(p_occurrence_id uuid, p_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; cid uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Contestação exclusiva do cliente por link validado'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF o.status<>'closed_unfounded' OR length(trim(coalesce(p_body,'')))=0 THEN RAISE EXCEPTION 'Contestação não permitida'; END IF;
  INSERT INTO public.occurrence_contestations(occurrence_id,body) VALUES(o.id,trim(p_body)) RETURNING id INTO cid;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,metadata) VALUES(o.id,'customer_reply','customer',trim(p_body),jsonb_build_object('action','unfounded_contestation','contestation_id',cid));
  SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
  PERFORM public.notify_user(a.kam_id,o.id,NULL,'contestation','Contestação recebida · '||o.protocol,trim(p_body),'contestation_'||cid,true);
  PERFORM public.notify_ops_managers(o.id,NULL,'contestation','Contestação recebida · '||o.protocol,a.name||' · '||trim(p_body),'contestation_'||cid,true);
  RETURN cid;
END $$;

CREATE FUNCTION public.submit_contestation_by_link(p_hash text, p_body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.public_links; cid uuid;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO l FROM public.public_links WHERE token_hash=p_hash AND purpose='contestation';
  IF l.id IS NULL OR now()>l.expires_at THEN RAISE EXCEPTION 'Link inválido ou expirado'; END IF;
  IF length(trim(coalesce(p_body,'')))<10 OR length(p_body)>4000 THEN RAISE EXCEPTION 'Descreva a contestação com pelo menos 10 caracteres'; END IF;
  IF EXISTS(SELECT 1 FROM public.occurrence_contestations WHERE occurrence_id=l.occurrence_id AND created_at>=l.created_at) THEN RAISE EXCEPTION 'A contestação desta análise já foi registrada'; END IF;
  cid:=public.submit_unfounded_contestation(l.occurrence_id,p_body);
  RETURN jsonb_build_object('status','received','id',cid);
END $$;

CREATE FUNCTION public.account_team(p_account_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_account_access(p_account_id) THEN RAISE EXCEPTION 'Sem acesso à conta'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'role',r.role) ORDER BY p.full_name)
    FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
    WHERE p.active AND r.role IN ('analyst','kam','ops_manager') AND public.user_has_account_access(p.id,p_account_id)),'[]'::jsonb);
END $$;

CREATE FUNCTION public.reassign_occurrence(p_occurrence_id uuid, p_user_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; old_name text; new_name text;
BEGIN
  IF NOT public.has_occurrence_access(p_occurrence_id) OR coalesce(public.current_app_role() NOT IN ('kam','ops_manager'),true) THEN RAISE EXCEPTION 'Somente KAM ou gestor pode reatribuir'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF o.status IN ('closed_resolved','closed_no_evaluation','closed_unfounded') THEN RAISE EXCEPTION 'Ocorrência encerrada'; END IF;
  IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe o motivo da reatribuição'; END IF;
  IF p_user_id IS NOT DISTINCT FROM o.assignee_id THEN RAISE EXCEPTION 'Selecione outro responsável'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=p_user_id AND p.active AND r.role IN ('analyst','kam','ops_manager'))
     OR NOT public.user_has_account_access(p_user_id,o.account_id) THEN RAISE EXCEPTION 'O novo responsável precisa ter acesso à conta'; END IF;
  SELECT full_name INTO old_name FROM public.profiles WHERE id=o.assignee_id;
  SELECT full_name INTO new_name FROM public.profiles WHERE id=p_user_id;
  UPDATE public.occurrences SET assignee_id=p_user_id,updated_at=now() WHERE id=o.id;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata)
    VALUES(o.id,'system','internal',auth.uid(),'Responsável alterado de '||coalesce(old_name,'ninguém')||' para '||new_name||'. Motivo: '||trim(p_reason),jsonb_build_object('action','reassign','from',o.assignee_id,'to',p_user_id));
  PERFORM public.notify_user(p_user_id,o.id,NULL,'assignment','Ocorrência atribuída a você · '||o.protocol,o.subject||'. Motivo: '||trim(p_reason),'assign_'||o.id||'_'||floor(extract(epoch FROM clock_timestamp())*1000)::bigint,true);
END $$;

CREATE FUNCTION public.escalate_occurrence(p_occurrence_id uuid, p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; a public.accounts; k text;
BEGIN
  IF NOT public.has_occurrence_access(p_occurrence_id) OR coalesce(public.current_app_role() NOT IN ('kam','ops_manager'),true) THEN RAISE EXCEPTION 'Somente KAM ou gestor pode escalar'; END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF o.status IN ('closed_resolved','closed_no_evaluation','closed_unfounded') THEN RAISE EXCEPTION 'Ocorrência encerrada'; END IF;
  IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Descreva o motivo do escalonamento com pelo menos 10 caracteres'; END IF;
  SELECT * INTO STRICT a FROM public.accounts WHERE id=o.account_id;
  k:='escalation_'||o.id||'_'||floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata) VALUES(o.id,'system','internal',auth.uid(),'Ocorrência escalada. Motivo: '||trim(p_reason),jsonb_build_object('action','escalate'));
  PERFORM public.notify_ops_managers(o.id,NULL,'escalation','Escalonamento · '||o.protocol,a.name||' · '||o.subject||'. Motivo: '||trim(p_reason),k,true);
  PERFORM public.notify_user(a.kam_id,o.id,NULL,'escalation','Escalonamento · '||o.protocol,o.subject||'. Motivo: '||trim(p_reason),k,false);
END $$;

CREATE FUNCTION public.resend_evaluation_invite(p_occurrence_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.occurrences; e public.evaluations;
BEGIN
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=p_occurrence_id FOR UPDATE;
  IF NOT public.can_manage_work(o.id,NULL) THEN RAISE EXCEPTION 'Reenvio não permitido para o seu perfil'; END IF;
  IF o.status<>'solution_proposed' THEN RAISE EXCEPTION 'A pesquisa só pode ser reenviada com a solução proposta'; END IF;
  SELECT * INTO e FROM public.evaluations WHERE occurrence_id=o.id AND cycle=o.reopen_count+1;
  IF e.answered_at IS NOT NULL THEN RAISE EXCEPTION 'O cliente já respondeu a pesquisa'; END IF;
  IF EXISTS(SELECT 1 FROM public.email_dispatches WHERE occurrence_id=o.id AND link_purpose='evaluation' AND status IN ('pending','retry','sending')) THEN RAISE EXCEPTION 'Já existe um envio da pesquisa em andamento'; END IF;
  IF EXISTS(SELECT 1 FROM public.email_dispatches WHERE occurrence_id=o.id AND link_purpose='evaluation' AND status='sent' AND sent_at>now()-interval '1 hour') THEN RAISE EXCEPTION 'A pesquisa foi enviada há menos de uma hora'; END IF;
  PERFORM public.enqueue_customer_email(o.id,'solution-evaluation',jsonb_build_object('headline','Solução da sua ocorrência','message',o.solution_text,'expectation',o.customer_expectation),'Reenvio da pesquisa ao contato','solution-resend-'||o.id||'-'||floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'evaluation',false);
  INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body) VALUES(o.id,'system','system',auth.uid(),'Reenvio da pesquisa de avaliação solicitado.');
END $$;

CREATE FUNCTION public.claim_email_dispatches(p_occurrence_id uuid DEFAULT NULL, p_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[];
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.email_dispatches SET status='failed',last_error=coalesce(last_error,'Tempo de envio esgotado') WHERE status='sending' AND attempts>=3 AND next_attempt_at<=now();
  SELECT array_agg(id) INTO ids FROM (
    SELECT id FROM public.email_dispatches
    WHERE status IN ('pending','retry','sending') AND attempts<3 AND next_attempt_at<=now() AND (p_occurrence_id IS NULL OR occurrence_id=p_occurrence_id)
    ORDER BY created_at LIMIT greatest(1,least(coalesce(p_limit,25),100)) FOR UPDATE SKIP LOCKED) s;
  IF ids IS NULL THEN RETURN '[]'::jsonb; END IF;
  UPDATE public.email_dispatches SET status='sending',attempts=attempts+1,next_attempt_at=now()+interval '10 minutes' WHERE id=ANY(ids);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'template',d.template,'occurrence_id',d.occurrence_id,'link_purpose',d.link_purpose,'data',d.data,
      'idempotency_key',d.idempotency_key,'attempts',d.attempts,'recipient_kind',d.recipient_kind,
      'email',CASE WHEN d.recipient_kind='contact' THEN c.email ELSE u.email::text END,
      'name',CASE WHEN d.recipient_kind='contact' THEN c.name ELSE p.full_name END) ORDER BY d.created_at)
    FROM public.email_dispatches d
    LEFT JOIN public.account_contacts c ON d.recipient_kind='contact' AND c.id=d.contact_id AND c.active
    LEFT JOIN public.profiles p ON d.recipient_kind='user' AND p.id=d.user_id AND p.active
    LEFT JOIN auth.users u ON u.id=p.id
    WHERE d.id=ANY(ids)),'[]'::jsonb);
END $$;

CREATE FUNCTION public.issue_public_link(p_dispatch_id uuid, p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.email_dispatches; o public.occurrences; e public.evaluations; expiry timestamptz;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Hash inválido'; END IF;
  SELECT * INTO d FROM public.email_dispatches WHERE id=p_dispatch_id AND status='sending';
  IF d.id IS NULL OR d.link_purpose IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','envio indisponível'); END IF;
  SELECT * INTO STRICT o FROM public.occurrences WHERE id=d.occurrence_id FOR UPDATE;
  IF d.link_purpose='evaluation' THEN
    IF o.status<>'solution_proposed' THEN RETURN jsonb_build_object('ok',false,'reason','a ocorrência não aguarda mais avaliação'); END IF;
    SELECT * INTO e FROM public.evaluations WHERE occurrence_id=o.id AND cycle=o.reopen_count+1 FOR UPDATE;
    IF e.id IS NULL THEN
      INSERT INTO public.evaluations(occurrence_id,cycle,token_hash,token_expires_at) VALUES(o.id,o.reopen_count+1,p_hash,now()+interval '15 days') RETURNING * INTO e;
      UPDATE public.public_links SET dispatch_id=d.id WHERE token_hash=p_hash;
    ELSE
      IF e.answered_at IS NOT NULL OR now()>e.token_expires_at THEN RETURN jsonb_build_object('ok',false,'reason','a pesquisa já foi respondida ou expirou'); END IF;
      INSERT INTO public.public_links(purpose,occurrence_id,evaluation_id,token_hash,dispatch_id) VALUES('evaluation',o.id,e.id,p_hash,d.id);
    END IF;
    RETURN jsonb_build_object('ok',true,'expires_at',e.token_expires_at);
  END IF;
  IF o.status<>'closed_unfounded' THEN RETURN jsonb_build_object('ok',false,'reason','a ocorrência não está mais encerrada como improcedente'); END IF;
  expiry:=coalesce(o.closed_at,now())+interval '15 days';
  IF now()>expiry THEN RETURN jsonb_build_object('ok',false,'reason','o prazo de contestação terminou'); END IF;
  INSERT INTO public.public_links(purpose,occurrence_id,token_hash,expires_at,dispatch_id) VALUES('contestation',o.id,p_hash,expiry,d.id);
  RETURN jsonb_build_object('ok',true,'expires_at',expiry);
END $$;

CREATE FUNCTION public.complete_email_dispatch(p_id uuid, p_outcome text, p_error text DEFAULT NULL, p_retry_after integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.email_dispatches; msg text; log_it boolean;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO d FROM public.email_dispatches WHERE id=p_id FOR UPDATE;
  IF d.id IS NULL OR d.status<>'sending' THEN RETURN; END IF;
  log_it:=d.recipient_kind='contact';
  IF p_outcome='sent' THEN
    UPDATE public.email_dispatches SET status='sent',sent_at=now(),last_error=NULL WHERE id=d.id;
    msg:=d.summary||' enviado.';
  ELSIF p_outcome='suppressed' THEN
    UPDATE public.email_dispatches SET status='suppressed',last_error='Destinatário bloqueou o recebimento' WHERE id=d.id;
    msg:=d.summary||' não enviado: o destinatário bloqueou o recebimento de e-mails.'; log_it:=true;
  ELSIF p_outcome='skipped' THEN
    UPDATE public.email_dispatches SET status='skipped',last_error=left(coalesce(p_error,'Envio cancelado'),500) WHERE id=d.id;
    msg:=d.summary||' não enviado: '||coalesce(p_error,'envio cancelado')||'.';
  ELSIF p_outcome='failed' THEN
    IF d.attempts>=3 THEN
      UPDATE public.email_dispatches SET status='failed',last_error=left(coalesce(p_error,'Falha no envio'),500) WHERE id=d.id;
      msg:=d.summary||' falhou após 3 tentativas.'; log_it:=true;
    ELSE
      UPDATE public.email_dispatches SET status='retry',last_error=left(coalesce(p_error,'Falha no envio'),500),
        next_attempt_at=now()+make_interval(secs=>greatest(coalesce(p_retry_after,0),CASE WHEN d.attempts=1 THEN 60 ELSE 300 END)) WHERE id=d.id;
      msg:=d.summary||' falhou na tentativa '||d.attempts||' de 3; nova tentativa automática.';
    END IF;
  ELSE RAISE EXCEPTION 'Resultado de envio inválido';
  END IF;
  IF d.occurrence_id IS NOT NULL AND log_it THEN
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,metadata)
      VALUES(d.occurrence_id,'system','system',msg,jsonb_build_object('action','email_dispatch','dispatch_id',d.id,'template',d.template,'outcome',p_outcome,'attempt',d.attempts));
  END IF;
END $$;

CREATE FUNCTION public.assign_cause_code() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  IF NEW.occurrence_id IS NOT NULL THEN
    PERFORM 1 FROM public.occurrences WHERE id=NEW.occurrence_id FOR UPDATE;
    SELECT count(*) INTO n FROM public.causes WHERE occurrence_id=NEW.occurrence_id;
  ELSE
    PERFORM 1 FROM public.problems WHERE id=NEW.problem_id FOR UPDATE;
    SELECT count(*) INTO n FROM public.causes WHERE problem_id=NEW.problem_id AND occurrence_id IS NULL;
  END IF;
  NEW.code:='C'||(n+1);
  RETURN NEW;
END $$;
CREATE TRIGGER cause_code BEFORE INSERT ON public.causes FOR EACH ROW EXECUTE FUNCTION public.assign_cause_code();
ALTER TABLE public.causes ADD CONSTRAINT causes_whys_limit CHECK (cardinality(whys) <= 7);

CREATE OR REPLACE FUNCTION public.validate_action_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.causes; acc uuid;
BEGIN
  IF NEW.cause_id IS NOT NULL THEN
    SELECT * INTO STRICT c FROM public.causes WHERE id=NEW.cause_id;
    IF (NEW.occurrence_id IS NOT NULL AND c.occurrence_id IS DISTINCT FROM NEW.occurrence_id) OR (NEW.problem_id IS NOT NULL AND NEW.occurrence_id IS NULL AND c.problem_id IS DISTINCT FROM NEW.problem_id) THEN
      RAISE EXCEPTION 'A causa deve pertencer à ocorrência ou problema da ação';
    END IF;
  END IF;
  IF NEW.status='done' AND length(trim(coalesce(NEW.evidence_note,'')))=0 AND NOT EXISTS(SELECT 1 FROM public.attachments WHERE action_id=NEW.id) THEN RAISE EXCEPTION 'A conclusão exige evidência'; END IF;
  IF TG_OP='UPDATE' AND auth.uid() IS NOT NULL AND public.current_app_role()='analyst' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id OR NEW.problem_id IS DISTINCT FROM OLD.problem_id) THEN
    RAISE EXCEPTION 'Não é permitido alterar responsável ou vínculo';
  END IF;
  IF TG_OP='INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF NEW.occurrence_id IS NOT NULL THEN SELECT account_id INTO acc FROM public.occurrences WHERE id=NEW.occurrence_id;
    ELSE SELECT account_id INTO acc FROM public.problems WHERE id=NEW.problem_id; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=NEW.owner_id AND p.active AND r.role IN ('analyst','kam','ops_manager'))
       OR (acc IS NOT NULL AND NOT public.user_has_account_access(NEW.owner_id,acc)) THEN
      RAISE EXCEPTION 'O responsável pela ação precisa ter acesso à conta';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sla_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer; due_txt text; k text; day_minutes integer; elapsed integer;
BEGIN
  UPDATE public.occurrences SET first_response_breached=true WHERE NOT first_response_breached AND first_response_at IS NULL AND now()>first_response_due_at AND status IN ('registered','in_analysis','in_treatment','awaiting_customer','reopened');
  UPDATE public.occurrences SET resolution_breached=true WHERE NOT resolution_breached AND now()>resolution_due_at AND status IN ('registered','in_analysis','in_treatment','reopened');

  FOR r IN
    WITH c AS (
      SELECT o.id,o.protocol,o.subject,o.assignee_id,o.reopen_count,o.resolution_due_at,a.kam_id,a.name AS account_name,t.resolution_minutes,
        public.business_minutes_between(a.calendar_id,o.resolution_started_at,now())-o.paused_business_minutes AS consumed
      FROM public.occurrences o JOIN public.accounts a ON a.id=o.account_id JOIN public.sla_targets t ON t.policy_id=a.sla_policy_id AND t.severity=o.severity
      WHERE o.status IN ('registered','in_analysis','in_treatment','reopened')
        AND NOT EXISTS(SELECT 1 FROM public.sla_alerts s WHERE s.occurrence_id=o.id AND s.alert_key='res_100_c'||(o.reopen_count+1)))
    SELECT c.*,x.threshold FROM c CROSS JOIN unnest(ARRAY[50,80,100]) AS x(threshold)
    WHERE c.consumed>=c.resolution_minutes*x.threshold/100.0 ORDER BY c.id,x.threshold
  LOOP
    k:='res_'||r.threshold||'_c'||(r.reopen_count+1);
    INSERT INTO public.sla_alerts(occurrence_id,alert_key) VALUES(r.id,k) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    CONTINUE WHEN n=0;
    due_txt:=public.sp_datetime(r.resolution_due_at);
    IF r.threshold=50 THEN
      PERFORM public.notify_user(coalesce(r.assignee_id,r.kam_id),r.id,NULL,'sla_50','SLA 50% · '||r.protocol,'Metade do prazo de solução foi consumida. Vence em '||due_txt||'.',k,false);
    ELSIF r.threshold=80 THEN
      IF r.kam_id IS NOT NULL THEN
        PERFORM public.notify_user(r.kam_id,r.id,NULL,'sla_80','SLA em risco · '||r.protocol,r.account_name||' · '||r.subject||'. Prazo de solução vence em '||due_txt||'. Responsável: '||coalesce((SELECT full_name FROM public.profiles WHERE id=r.assignee_id),'não atribuído')||'.',k,true);
      ELSE
        PERFORM public.notify_ops_managers(r.id,NULL,'sla_80','SLA em risco · '||r.protocol,r.account_name||' · '||r.subject||'. Prazo de solução vence em '||due_txt||'. A conta não possui KAM definido.',k,true);
      END IF;
    ELSE
      PERFORM public.notify_ops_managers(r.id,NULL,'sla_100','SLA violado · '||r.protocol,r.account_name||' · '||r.subject||'. O prazo de solução venceu em '||due_txt||'.',k,true);
      PERFORM public.notify_user(r.assignee_id,r.id,NULL,'sla_100','SLA violado · '||r.protocol,'O prazo de solução venceu em '||due_txt||'.',k,false);
    END IF;
  END LOOP;

  FOR r IN
    SELECT o.id,o.protocol,o.subject,o.first_response_due_at,a.name AS account_name FROM public.occurrences o JOIN public.accounts a ON a.id=o.account_id
    WHERE o.first_response_at IS NULL AND now()>o.first_response_due_at AND o.status IN ('registered','in_analysis','in_treatment','awaiting_customer','reopened')
      AND NOT EXISTS(SELECT 1 FROM public.sla_alerts s WHERE s.occurrence_id=o.id AND s.alert_key='fr_100')
  LOOP
    INSERT INTO public.sla_alerts(occurrence_id,alert_key) VALUES(r.id,'fr_100') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    CONTINUE WHEN n=0;
    PERFORM public.notify_ops_managers(r.id,NULL,'first_response_100','1ª resposta violada · '||r.protocol,r.account_name||' · '||r.subject||'. A 1ª resposta venceu em '||public.sp_datetime(r.first_response_due_at)||'.','fr_100',true);
  END LOOP;

  FOR r IN
    SELECT o.id,o.protocol,o.assignee_id,o.reopen_count,o.next_update_due_at,a.kam_id FROM public.occurrences o JOIN public.accounts a ON a.id=o.account_id
    WHERE o.severity IN ('S1','S2') AND o.status IN ('registered','in_analysis','in_treatment','reopened') AND now()>o.next_update_due_at
  LOOP
    k:='update_'||extract(epoch FROM r.next_update_due_at)::bigint::text||'_c'||(r.reopen_count+1);
    INSERT INTO public.sla_alerts(occurrence_id,alert_key) VALUES(r.id,k) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    CONTINUE WHEN n=0;
    PERFORM public.notify_user(coalesce(r.assignee_id,r.kam_id),r.id,NULL,'update_overdue','Atualização atrasada · '||r.protocol,'O cliente aguarda atualização desde '||public.sp_datetime(r.next_update_due_at)||'.',k,false);
  END LOOP;

  FOR r IN
    SELECT ac.id,ac.owner_id,ac.occurrence_id,ac.problem_id,ac.what,ac.due_date,coalesce(o.protocol,p.code) AS ref
    FROM public.actions ac LEFT JOIN public.occurrences o ON o.id=ac.occurrence_id LEFT JOIN public.problems p ON p.id=ac.problem_id
    WHERE ac.status IN ('open','in_progress') AND ac.due_date<(now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND NOT EXISTS(SELECT 1 FROM public.notifications nt WHERE nt.user_id=ac.owner_id AND nt.dedupe_key='action_overdue_'||ac.id)
  LOOP
    PERFORM public.notify_user(r.owner_id,r.occurrence_id,r.problem_id,'action_overdue','Ação vencida · '||coalesce(r.ref,'plano de ação'),r.what||' · prazo '||to_char(r.due_date,'DD/MM/YYYY')||'.','action_overdue_'||r.id,true);
  END LOOP;

  FOR r IN
    SELECT e.id AS eval_id,e.sent_at,e.reminders_sent,o.id,o.protocol,o.solution_text,o.customer_expectation,o.assignee_id,a.calendar_id,c.work_start,c.work_end
    FROM public.evaluations e JOIN public.occurrences o ON o.id=e.occurrence_id AND e.cycle=o.reopen_count+1
    JOIN public.accounts a ON a.id=o.account_id JOIN public.business_calendars c ON c.id=a.calendar_id
    WHERE o.status='solution_proposed' AND e.answered_at IS NULL
  LOOP
    day_minutes:=greatest(1,(extract(epoch FROM (r.work_end-r.work_start))/60)::integer);
    elapsed:=public.business_minutes_between(r.calendar_id,r.sent_at,now());
    IF r.reminders_sent>=2 AND elapsed>=5*day_minutes THEN
      UPDATE public.occurrences SET status='closed_no_evaluation',closed_at=now(),updated_at=now() WHERE id=r.id;
      INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,body,from_status,to_status,metadata)
        VALUES(r.id,'status_change','system','Encerrada sem avaliação: 5 dias úteis sem resposta após 2 lembretes.','solution_proposed','closed_no_evaluation',jsonb_build_object('action','expire_evaluation'));
      PERFORM public.notify_user(r.assignee_id,r.id,NULL,'expired_evaluation','Encerrada sem avaliação · '||r.protocol,'O cliente não respondeu a pesquisa em 5 dias úteis. Ele ainda pode reabrir em até 15 dias.','expired_'||r.eval_id,false);
    ELSIF r.reminders_sent<2 AND elapsed>=(r.reminders_sent+1)*2*day_minutes THEN
      UPDATE public.evaluations SET reminders_sent=reminders_sent+1 WHERE id=r.eval_id;
      PERFORM public.enqueue_customer_email(r.id,'evaluation-reminder',jsonb_build_object('headline','Lembrete: avalie a solução','message',r.solution_text,'expectation',r.customer_expectation,'reminder',r.reminders_sent+1),
        'Lembrete '||(r.reminders_sent+1)||' da pesquisa ao contato','eval-reminder-'||r.eval_id||'-'||(r.reminders_sent+1),'evaluation',false);
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.register_evaluation_link(), public.after_occurrence_registered(), public.assign_cause_code(),
  public.user_has_account_access(uuid,uuid), public.notify_user(uuid,uuid,uuid,text,text,text,text,boolean),
  public.notify_ops_managers(uuid,uuid,text,text,text,text,boolean), public.enqueue_customer_email(uuid,text,jsonb,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_email_dispatches(uuid,integer), public.complete_email_dispatch(uuid,text,text,integer),
  public.issue_public_link(uuid,text), public.submit_contestation_by_link(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_dispatches(uuid,integer), public.complete_email_dispatch(uuid,text,text,integer),
  public.issue_public_link(uuid,text), public.submit_contestation_by_link(text,text), public.sla_tick() TO service_role;
REVOKE EXECUTE ON FUNCTION public.reassign_occurrence(uuid,uuid,text), public.escalate_occurrence(uuid,text), public.account_team(uuid),
  public.resend_evaluation_invite(uuid), public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_occurrence(uuid,uuid,text), public.escalate_occurrence(uuid,text), public.account_team(uuid),
  public.resend_evaluation_invite(uuid), public.mark_notifications_read(uuid[]) TO authenticated, service_role;