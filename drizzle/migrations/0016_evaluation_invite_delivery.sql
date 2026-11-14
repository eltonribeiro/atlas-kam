ALTER TABLE public.evaluations ADD COLUMN invite_sent_at timestamptz;
COMMENT ON COLUMN public.evaluations.invite_sent_at IS 'When the survey invitation was actually delivered to the e-mail service; reminders, tacit closure and response rate count from here.';
COMMENT ON COLUMN public.evaluations.sent_at IS 'When the personal link was issued; may precede delivery. Use invite_sent_at for reminders and indicators.';
UPDATE public.evaluations e SET invite_sent_at=e.sent_at
  WHERE e.invite_sent_at IS NULL AND (
    e.answered_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.email_dispatches d WHERE d.occurrence_id=e.occurrence_id AND d.link_purpose='evaluation' AND d.status='sent')
    OR NOT EXISTS(SELECT 1 FROM public.email_dispatches d WHERE d.occurrence_id=e.occurrence_id AND d.link_purpose='evaluation'));
GRANT SELECT(invite_sent_at) ON public.evaluations TO authenticated;

CREATE OR REPLACE FUNCTION public.sla_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT e.id AS eval_id,e.invite_sent_at AS sent_at,e.reminders_sent,o.id,o.protocol,o.solution_text,o.customer_expectation,o.assignee_id,a.calendar_id,c.work_start,c.work_end
    FROM public.evaluations e JOIN public.occurrences o ON o.id=e.occurrence_id AND e.cycle=o.reopen_count+1
    JOIN public.accounts a ON a.id=o.account_id JOIN public.business_calendars c ON c.id=a.calendar_id
    WHERE o.status='solution_proposed' AND e.answered_at IS NULL AND e.invite_sent_at IS NOT NULL
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
END $function$;

CREATE OR REPLACE FUNCTION public.kpi_window(p_from timestamp with time zone, p_to timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH occ AS (
  SELECT o.id,o.created_at,o.first_response_at,o.first_response_breached,a.calendar_id,
    greatest(1,(extract(epoch FROM (bc.work_end-bc.work_start))/60)::integer) AS day_minutes
  FROM public.occurrences o JOIN public.accounts a ON a.id=o.account_id JOIN public.business_calendars bc ON bc.id=a.calendar_id
  WHERE o.type IN ('complaint','incident') AND (p_account IS NULL OR o.account_id=p_account)
),
fr AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE NOT first_response_breached) AS ok,
    avg(public.business_minutes_between(calendar_id,created_at,first_response_at)) AS avg_minutes
  FROM occ WHERE first_response_at>=p_from AND first_response_at<p_to
),
sol AS (
  SELECT c.occurrence_id,c.cycle,c.paused_business_minutes,c.solution_proposed_at,occ.created_at,occ.calendar_id,occ.day_minutes,
    EXISTS(SELECT 1 FROM public.occurrence_sla_cycles c2 WHERE c2.occurrence_id=c.occurrence_id AND c2.cycle<=c.cycle AND c2.resolution_breached) AS breached
  FROM public.occurrence_sla_cycles c JOIN occ ON occ.id=c.occurrence_id
  WHERE c.solution_proposed_at>=p_from AND c.solution_proposed_at<p_to
),
sol_stats AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE NOT breached) AS ok,
    avg(greatest(0,public.business_minutes_between(calendar_id,created_at,solution_proposed_at)-paused_business_minutes)) FILTER (WHERE cycle=1) AS avg_minutes,
    avg(greatest(0,public.business_minutes_between(calendar_id,created_at,solution_proposed_at)-paused_business_minutes)::numeric/day_minutes) FILTER (WHERE cycle=1) AS avg_days
  FROM sol
),
ev AS (SELECT e.* FROM public.evaluations e JOIN occ ON occ.id=e.occurrence_id),
answered AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE resolved='yes') AS yes, avg(csat) AS csat, avg(ces) AS ces
  FROM ev WHERE answered_at>=p_from AND answered_at<p_to
),
sent AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE answered_at IS NOT NULL) AS answered
  FROM ev WHERE invite_sent_at>=p_from AND invite_sent_at<p_to
),
closures AS (
  SELECT e.occurrence_id,e.created_at FROM public.occurrence_events e JOIN occ ON occ.id=e.occurrence_id
  WHERE e.to_status IN ('closed_resolved','closed_no_evaluation') AND e.created_at>=p_from AND e.created_at<p_to
),
reopen AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.occurrence_events r WHERE r.occurrence_id=closures.occurrence_id AND r.to_status='reopened' AND r.created_at>closures.created_at AND r.created_at<=closures.created_at+interval '15 days')) AS reopened
  FROM closures
)
SELECT jsonb_build_object(
  'resolution_index', CASE WHEN answered.total>0 THEN round(100.0*answered.yes/answered.total,1) END,
  'resolution_index_n', answered.total,
  'first_response_sla', CASE WHEN fr.total>0 THEN round(100.0*fr.ok/fr.total,1) END,
  'first_response_n', fr.total,
  'solution_sla', CASE WHEN sol_stats.total>0 THEN round(100.0*sol_stats.ok/sol_stats.total,1) END,
  'solution_n', sol_stats.total,
  'first_response_avg_minutes', round(fr.avg_minutes),
  'solution_avg_minutes', round(sol_stats.avg_minutes),
  'solution_avg_days', round(sol_stats.avg_days,1),
  'csat', round(answered.csat,2),
  'ces', round(answered.ces,2),
  'evaluations_answered', answered.total,
  'response_rate', CASE WHEN sent.total>0 THEN round(100.0*sent.answered/sent.total,1) END,
  'surveys_sent', sent.total,
  'surveys_answered', sent.answered,
  'reopen_rate', CASE WHEN reopen.total>0 THEN round(100.0*reopen.reopened/reopen.total,1) END,
  'closures_n', reopen.total,
  'reopened_n', reopen.reopened)
FROM fr, sol_stats, answered, sent, reopen
$function$;

CREATE OR REPLACE FUNCTION public.complete_email_dispatch(p_id uuid, p_outcome text, p_error text DEFAULT NULL, p_retry_after integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.email_dispatches; msg text; log_it boolean;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO d FROM public.email_dispatches WHERE id=p_id FOR UPDATE;
  IF d.id IS NULL OR d.status<>'sending' THEN RETURN; END IF;
  log_it:=d.recipient_kind='contact';
  IF p_outcome='sent' THEN
    UPDATE public.email_dispatches SET status='sent',sent_at=now(),last_error=NULL WHERE id=d.id;
    IF d.link_purpose='evaluation' THEN
      UPDATE public.evaluations e SET invite_sent_at=now()
        FROM public.occurrences o
        WHERE o.id=d.occurrence_id AND e.occurrence_id=o.id AND e.cycle=o.reopen_count+1 AND e.invite_sent_at IS NULL;
    END IF;
    msg:=d.summary||' enviado.';
  ELSIF p_outcome='suppressed' THEN
    UPDATE public.email_dispatches SET status='suppressed',last_error='Destinatário bloqueou o recebimento' WHERE id=d.id;
    msg:=d.summary||' não enviado: o destinatário bloqueou o recebimento de e-mails.'; log_it:=true;
  ELSIF p_outcome='skipped' THEN
    UPDATE public.email_dispatches SET status='skipped',last_error=left(coalesce(p_error,'Envio cancelado'),500) WHERE id=d.id;
    msg:=d.summary||' não enviado: '||coalesce(p_error,'envio cancelado')||'.';
  ELSIF p_outcome='deferred' THEN
    -- Sending is unavailable project-wide (domain in verification, e-mails disabled, app address missing):
    -- keep the message waiting without spending one of its three delivery attempts.
    UPDATE public.email_dispatches SET status='retry',attempts=greatest(d.attempts-1,0),last_error=left(coalesce(p_error,'Envio aguardando liberação'),500),
      next_attempt_at=now()+make_interval(secs=>greatest(coalesce(p_retry_after,0),900)) WHERE id=d.id;
    log_it:=false;
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