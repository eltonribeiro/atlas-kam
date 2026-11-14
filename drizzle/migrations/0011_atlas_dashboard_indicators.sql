CREATE FUNCTION public.kpi_window(p_from timestamptz, p_to timestamptz, p_account uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
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
  FROM ev WHERE sent_at>=p_from AND sent_at<p_to
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
$$;

CREATE FUNCTION public.dashboard_kpis(p_from date, p_to date, p_account_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE start_at timestamptz; end_at timestamptz; span interval;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>731 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  start_at:=(p_from::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  end_at:=((p_to+1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  span:=end_at-start_at;
  RETURN jsonb_build_object('from',start_at,'to',end_at,'previous_from',start_at-span,
    'current',public.kpi_window(start_at,end_at,p_account_id),
    'previous',public.kpi_window(start_at-span,start_at,p_account_id));
END $$;

CREATE FUNCTION public.occurrence_pareto(p_account_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH counts AS (
  SELECT c.name, count(*) AS n FROM public.occurrences o JOIN public.categories c ON c.id=o.category_id
  WHERE o.type IN ('complaint','incident') AND o.created_at>=now()-interval '90 days' AND (p_account_id IS NULL OR o.account_id=p_account_id)
  GROUP BY c.name
), ranked AS (
  SELECT name, n, row_number() OVER (ORDER BY n DESC, name) AS pos, sum(n) OVER () AS total FROM counts
), grouped AS (
  SELECT CASE WHEN pos<=4 THEN name ELSE 'Outros' END AS label, CASE WHEN pos<=4 THEN pos ELSE 5 END AS ord, sum(n) AS n, max(total) AS total FROM ranked GROUP BY 1,2
)
SELECT jsonb_build_object(
  'total', coalesce((SELECT max(total) FROM grouped),0),
  'items', coalesce((SELECT jsonb_agg(jsonb_build_object('label',label,'count',n,'percent',round(100.0*n/nullif(total,0),1)) ORDER BY ord) FROM grouped),'[]'::jsonb),
  'open_problems', (SELECT count(*) FROM public.problems p WHERE p.status NOT IN ('closed','cancelled') AND (p_account_id IS NULL OR p.account_id=p_account_id)))
$$;

CREATE FUNCTION public.backlog_aging(p_account_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH open AS (
  SELECT floor(public.business_minutes_between(a.calendar_id,o.created_at,now())::numeric/greatest(1,(extract(epoch FROM (bc.work_end-bc.work_start))/60)))::integer AS days
  FROM public.occurrences o JOIN public.accounts a ON a.id=o.account_id JOIN public.business_calendars bc ON bc.id=a.calendar_id
  WHERE o.type IN ('complaint','incident') AND o.status NOT IN ('closed_resolved','closed_no_evaluation','closed_unfounded') AND (p_account_id IS NULL OR o.account_id=p_account_id)
)
SELECT jsonb_build_object(
  'd0_2', count(*) FILTER (WHERE days<=2),
  'd3_5', count(*) FILTER (WHERE days BETWEEN 3 AND 5),
  'd6_10', count(*) FILTER (WHERE days BETWEEN 6 AND 10),
  'd10_plus', count(*) FILTER (WHERE days>10),
  'total', count(*))
FROM open
$$;

CREATE VIEW public.v_occurrence_list WITH (security_invoker=true) AS
SELECT o.id,o.protocol,o.account_id,a.name AS account_name,o.subject,o.category_id,c.name AS category_name,o.severity,o.type,o.status,
  o.assignee_id,pr.full_name AS assignee_name,o.created_at,o.first_response_at,o.first_response_due_at,o.first_response_breached,
  o.resolution_due_at,o.resolution_breached,o.reopen_count,o.problem_id,o.paused_since,
  s.sla_state,s.consumed_percent,
  CASE WHEN o.first_response_at IS NOT NULL THEN public.business_minutes_between(a.calendar_id,o.created_at,o.first_response_at) END AS first_response_minutes,
  (o.first_response_at IS NULL AND o.status NOT IN ('closed_resolved','closed_no_evaluation','closed_unfounded') AND now()>o.first_response_due_at) AS first_response_overdue,
  ev.resolved AS evaluation_resolved,ev.csat AS evaluation_csat,ev.ces AS evaluation_ces,ev.answered_at AS evaluation_answered_at,(ev.id IS NOT NULL) AS evaluation_sent,
  CASE WHEN o.status NOT IN ('closed_resolved','closed_no_evaluation','closed_unfounded') AND (s.sla_state='breached' OR (o.first_response_at IS NULL AND now()>o.first_response_due_at)) THEN 0
       WHEN s.sla_state='risk' THEN 1 ELSE 2 END AS sort_rank,
  (o.protocol||' '||a.name||' '||o.subject) AS search_text
FROM public.occurrences o
JOIN public.accounts a ON a.id=o.account_id
JOIN public.categories c ON c.id=o.category_id
LEFT JOIN public.profiles pr ON pr.id=o.assignee_id
LEFT JOIN public.v_occurrence_sla s ON s.id=o.id
LEFT JOIN LATERAL (SELECT e.id,e.resolved,e.csat,e.ces,e.answered_at FROM public.evaluations e WHERE e.occurrence_id=o.id ORDER BY e.cycle DESC LIMIT 1) ev ON true;
GRANT SELECT ON public.v_occurrence_list TO authenticated, service_role;

CREATE VIEW public.v_problem_list WITH (security_invoker=true) AS
SELECT p.id,p.code,p.title,p.account_id,a.name AS account_name,p.category_id,c.name AS category_name,p.status,p.owner_id,pr.full_name AS owner_name,
  p.effectiveness_due_date,p.effectiveness_effective,p.created_at,p.closed_at,
  (SELECT count(*) FROM public.occurrences o WHERE o.problem_id=p.id) AS occurrence_count,
  (SELECT count(*) FROM public.actions ac WHERE ac.problem_id=p.id AND ac.status='done') AS actions_done,
  (SELECT count(*) FROM public.actions ac WHERE ac.problem_id=p.id AND ac.status<>'cancelled') AS actions_total
FROM public.problems p
LEFT JOIN public.accounts a ON a.id=p.account_id
LEFT JOIN public.categories c ON c.id=p.category_id
LEFT JOIN public.profiles pr ON pr.id=p.owner_id;
GRANT SELECT ON public.v_problem_list TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.kpi_window(timestamptz,timestamptz,uuid), public.dashboard_kpis(date,date,uuid), public.occurrence_pareto(uuid), public.backlog_aging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_window(timestamptz,timestamptz,uuid), public.dashboard_kpis(date,date,uuid), public.occurrence_pareto(uuid), public.backlog_aging(uuid) TO authenticated, service_role;