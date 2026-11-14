CREATE TABLE public.config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete','anonymize')),
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX config_audit_recent ON public.config_audit (created_at DESC);
GRANT SELECT ON public.config_audit TO authenticated;
GRANT ALL ON public.config_audit TO service_role;
ALTER TABLE public.config_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_audit_admin_read ON public.config_audit FOR SELECT TO authenticated USING (public.is_config_admin());
CREATE TRIGGER immutable_config_audit BEFORE UPDATE OR DELETE ON public.config_audit FOR EACH ROW EXECUTE FUNCTION public.reject_event_mutation();

CREATE FUNCTION public.audit_config_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rec jsonb; k text;
BEGIN
  rec:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  k:=coalesce(rec->>'id', CASE TG_TABLE_NAME
      WHEN 'holidays' THEN (rec->>'calendar_id')||':'||(rec->>'day')
      WHEN 'sla_targets' THEN (rec->>'policy_id')||':'||(rec->>'severity')
      WHEN 'account_members' THEN (rec->>'account_id')||':'||(rec->>'user_id')
      WHEN 'user_roles' THEN (rec->>'user_id')||':'||(rec->>'role')
      ELSE '' END);
  IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
  INSERT INTO public.config_audit(table_name,record_key,action,old_data,new_data,actor_id)
    VALUES(TG_TABLE_NAME,k,lower(TG_OP),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,auth.uid());
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_config_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_business_calendars AFTER INSERT OR UPDATE OR DELETE ON public.business_calendars FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_holidays AFTER INSERT OR UPDATE OR DELETE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_sla_policies AFTER INSERT OR UPDATE OR DELETE ON public.sla_policies FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_sla_targets AFTER INSERT OR UPDATE OR DELETE ON public.sla_targets FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_accounts AFTER INSERT OR UPDATE OR DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_account_contacts AFTER INSERT OR UPDATE OR DELETE ON public.account_contacts FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_account_members AFTER INSERT OR UPDATE OR DELETE ON public.account_members FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.audit_config_change();

ALTER TABLE public.business_calendars ADD CONSTRAINT business_calendars_hours CHECK (work_end > work_start);
ALTER TABLE public.business_calendars ADD CONSTRAINT business_calendars_days CHECK (cardinality(work_days) BETWEEN 1 AND 7 AND work_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);
ALTER TABLE public.business_calendars ADD CONSTRAINT business_calendars_name CHECK (length(trim(name)) BETWEEN 2 AND 80);
ALTER TABLE public.sla_targets ADD CONSTRAINT sla_targets_positive CHECK (first_response_minutes > 0 AND resolution_minutes > 0 AND update_interval_minutes > 0 AND first_response_minutes <= resolution_minutes);
ALTER TABLE public.sla_policies ADD CONSTRAINT sla_policies_name CHECK (length(trim(name)) BETWEEN 2 AND 80);
ALTER TABLE public.categories ADD CONSTRAINT categories_name CHECK (length(trim(name)) BETWEEN 2 AND 80);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_name CHECK (length(trim(name)) BETWEEN 2 AND 120);
ALTER TABLE public.account_contacts ADD CONSTRAINT account_contacts_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

CREATE FUNCTION public.validate_calendar_timezone() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Fuso horário inválido'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER calendar_timezone_guard BEFORE INSERT OR UPDATE OF timezone ON public.business_calendars FOR EACH ROW EXECUTE FUNCTION public.validate_calendar_timezone();

CREATE FUNCTION public.validate_category_parent() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND (NEW.parent_id=NEW.id OR EXISTS(SELECT 1 FROM public.categories WHERE id=NEW.parent_id AND parent_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Subcategorias devem pertencer a uma categoria principal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER category_parent_guard BEFORE INSERT OR UPDATE OF parent_id ON public.categories FOR EACH ROW EXECUTE FUNCTION public.validate_category_parent();

CREATE FUNCTION public.validate_account_kam() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.kam_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.user_id=NEW.kam_id AND r.role='kam' AND p.active) THEN
    RAISE EXCEPTION 'O KAM da conta deve ter o perfil KAM ativo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_kam_guard BEFORE INSERT OR UPDATE OF kam_id ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.validate_account_kam();

CREATE FUNCTION public.ensure_kam_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.kam_id IS NOT NULL THEN
    INSERT INTO public.account_members(account_id,user_id) VALUES(NEW.id,NEW.kam_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_kam_membership AFTER INSERT OR UPDATE OF kam_id ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.ensure_kam_membership();
REVOKE EXECUTE ON FUNCTION public.validate_account_kam(), public.ensure_kam_membership(), public.validate_calendar_timezone(), public.validate_category_parent() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_sla_policy(p_name text, p_copy_from uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid;
BEGIN
  IF NOT public.is_config_admin() THEN RAISE EXCEPTION 'Somente o administrador configura políticas de SLA'; END IF;
  IF (SELECT count(*) FROM public.sla_targets WHERE policy_id=p_copy_from)<>4 THEN RAISE EXCEPTION 'Selecione uma política de origem completa'; END IF;
  INSERT INTO public.sla_policies(name) VALUES(trim(p_name)) RETURNING id INTO pid;
  INSERT INTO public.sla_targets(policy_id,severity,first_response_minutes,resolution_minutes,update_interval_minutes)
    SELECT pid,severity,first_response_minutes,resolution_minutes,update_interval_minutes FROM public.sla_targets WHERE policy_id=p_copy_from;
  RETURN pid;
END $$;

CREATE FUNCTION public.admin_staff() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_config_admin() THEN RAISE EXCEPTION 'Somente o administrador consulta a equipe'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'active',p.active,'email',u.email,'role',r.role,
      'accounts',(SELECT coalesce(jsonb_agg(m.account_id),'[]'::jsonb) FROM public.account_members m WHERE m.user_id=p.id)) ORDER BY p.full_name)
    FROM public.profiles p JOIN auth.users u ON u.id=p.id LEFT JOIN public.user_roles r ON r.user_id=p.id),'[]'::jsonb);
END $$;

CREATE FUNCTION public.anonymize_contact(p_contact_id uuid, p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.account_contacts; o record;
BEGIN
  IF NOT public.is_config_admin() THEN RAISE EXCEPTION 'Somente o administrador atende pedidos de titulares'; END IF;
  IF length(trim(coalesce(p_reference,'')))<3 THEN RAISE EXCEPTION 'Informe a referência do pedido do titular'; END IF;
  SELECT * INTO STRICT c FROM public.account_contacts WHERE id=p_contact_id FOR UPDATE;
  UPDATE public.account_contacts SET name='Contato anonimizado',email='anonimizado-'||c.id||'@contato.invalid',job_title=NULL,active=false WHERE id=c.id;
  INSERT INTO public.config_audit(table_name,record_key,action,actor_id,note) VALUES('account_contacts',c.id::text,'anonymize',auth.uid(),'Pedido do titular: '||trim(p_reference));
  FOR o IN SELECT id FROM public.occurrences WHERE contact_id=c.id LOOP
    INSERT INTO public.occurrence_events(occurrence_id,kind,visibility,author_id,body,metadata)
      VALUES(o.id,'system','internal',auth.uid(),'Dados cadastrais do contato anonimizados a pedido do titular.',jsonb_build_object('action','anonymize_contact','reference',trim(p_reference)));
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_sla_policy(text,uuid), public.admin_staff(), public.anonymize_contact(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sla_policy(text,uuid), public.admin_staff(), public.anonymize_contact(uuid,text) TO authenticated, service_role;