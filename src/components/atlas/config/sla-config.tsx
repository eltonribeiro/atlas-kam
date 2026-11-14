import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addHoliday, createPolicy, getSlaConfig, removeHoliday, saveCalendar, saveCategory, savePolicy } from '@/lib/config.functions';
import { FieldError, PageHeading, formatDate, formatDateTime, severityNames } from '../occurrence-ui';

export const slaConfigOptions = queryOptions({ queryKey: ['sla-config'], queryFn: () => getSlaConfig() });
type Config = Awaited<ReturnType<typeof getSlaConfig>>;
const severities = ['S1', 'S2', 'S3', 'S4'] as const;
const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const timezones = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Maceio', 'America/Araguaina', 'America/Noronha'];
const tableLabels: Record<string, string> = { business_calendars: 'Calendário', holidays: 'Feriado', sla_policies: 'Política de SLA', sla_targets: 'Meta de SLA', categories: 'Categoria', accounts: 'Conta', account_contacts: 'Contato', account_members: 'Alocação', user_roles: 'Perfil de acesso', profiles: 'Acesso' };
const actionNames: Record<string, string> = { insert: 'inclusão', update: 'alteração', delete: 'exclusão', INSERT: 'inclusão', UPDATE: 'alteração', DELETE: 'exclusão' };

function useRefresh() {
  const qc = useQueryClient();
  return async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['sla-config'] }), qc.invalidateQueries({ queryKey: ['occurrence-catalog'] }), qc.invalidateQueries({ queryKey: ['accounts-overview'] })]); };
}

export function SlaConfig() {
  const { data } = useSuspenseQuery(slaConfigOptions);
  return (
    <main className="atlas-main">
      <PageHeading eyebrow="CONFIGURAÇÃO" title="Contratos e SLA" subtitle={data.canEdit ? 'Políticas de prazo, calendários úteis e categorias. Toda alteração fica registrada no histórico.' : 'Consulta das políticas de prazo e calendários. Somente o administrador altera a configuração.'} />
      <Tabs defaultValue="policies">
        <TabsList aria-label="Seções da configuração"><TabsTrigger value="policies">Políticas de SLA</TabsTrigger><TabsTrigger value="calendars">Calendários e feriados</TabsTrigger><TabsTrigger value="categories">Categorias</TabsTrigger>{data.canEdit && <TabsTrigger value="audit">Histórico</TabsTrigger>}</TabsList>
        <TabsContent value="policies"><Policies data={data} /></TabsContent>
        <TabsContent value="calendars"><Calendars data={data} /></TabsContent>
        <TabsContent value="categories"><Categories data={data} /></TabsContent>
        {data.canEdit && <TabsContent value="audit"><Audit data={data} /></TabsContent>}
      </Tabs>
    </main>
  );
}

const toHours = (m?: number) => (m === undefined ? '' : String(Math.round((m / 60) * 100) / 100).replace('.', ','));
const toMinutes = (h: string) => Math.round(Number(h.replace(',', '.')) * 60);

function Policies({ data }: { data: Config }) {
  const [policyId, setPolicyId] = useState(data.policies[0]?.id ?? '');
  const policy = data.policies.find((p) => p.id === policyId);
  const [name, setName] = useState(policy?.name ?? '');
  const [values, setValues] = useState<Record<string, { fr: string; res: string; upd: string }>>({});
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const refresh = useRefresh();
  const save = useServerFn(savePolicy);
  useEffect(() => {
    setName(policy?.name ?? '');
    const next: typeof values = {};
    for (const s of severities) { const t = data.targets.find((x) => x.policy_id === policyId && x.severity === s); next[s] = { fr: toHours(t?.first_response_minutes), res: toHours(t?.resolution_minutes), upd: toHours(t?.update_interval_minutes) }; }
    setValues(next);
    setError('');
  }, [policyId, data.targets, policy?.name]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { id: policyId, name: name.trim(), targets: severities.map((s) => ({ severity: s, firstResponse: toMinutes(values[s]?.fr ?? ''), resolution: toMinutes(values[s]?.res ?? ''), update: toMinutes(values[s]?.upd ?? '') })) } }),
    onSuccess: async () => { toast.success('Política salva. Os novos prazos valem para as próximas ocorrências e ciclos.'); await refresh(); },
    onError: (e) => setError(e.message),
  });
  const accountsUsing = data.accounts.filter((a) => a.sla_policy_id === policyId);
  return (
    <section className="work-section">
      <div className="filter-row">
        <label className="select-field">Política<select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>{data.policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {data.canEdit && <Button variant="outline" onClick={() => setCreating(true)}><Plus />Nova política</Button>}
      </div>
      {policy && (
        <form onSubmit={(e) => { e.preventDefault(); setError(''); for (const s of severities) { const v = values[s]; if (!v || [v.fr, v.res, v.upd].some((x) => !x || Number.isNaN(Number(x.replace(',', '.'))) || Number(x.replace(',', '.')) <= 0)) { setError(`Preencha prazos positivos para ${s}.`); return; } if (toMinutes(v.fr) > toMinutes(v.res)) { setError(`Em ${s}, a 1ª resposta não pode superar o prazo de solução.`); return; } } mutation.mutate(); }}>
          {data.canEdit && <label className="field" htmlFor="policy-name">Nome da política<Input id="policy-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>}
          <div className="table-scroll">
            <table className="atlas-table config-table">
              <thead><tr><th>Severidade</th><th>1ª resposta (h úteis)</th><th>Solução proposta (h úteis)</th><th>Atualização ao cliente (h úteis)</th></tr></thead>
              <tbody>
                {severities.map((s) => (
                  <tr key={s}>
                    <td><span className={`severity-badge sev-${s}`}>{s}</span> {severityNames[s]}</td>
                    {(['fr', 'res', 'upd'] as const).map((k) => <td key={k}>{data.canEdit ? <Input aria-label={`${s} ${k === 'fr' ? '1ª resposta' : k === 'res' ? 'solução' : 'atualização'} em horas`} inputMode="decimal" value={values[s]?.[k] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [s]: { ...(prev[s] ?? { fr: '', res: '', upd: '' }), [k]: e.target.value } }))} className="hours-input" /> : <span className="font-mono">{values[s]?.[k]} h</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">Um dia útil equivale à jornada do calendário da conta (ex.: 10 h). Usada por: {accountsUsing.map((a) => a.name).join(', ') || 'nenhuma conta'}.</p>
          <FieldError message={error} />
          {data.canEdit && <Button disabled={mutation.isPending}><Save />{mutation.isPending ? 'Salvando…' : 'Salvar política'}</Button>}
        </form>
      )}
      {creating && <NewPolicyDialog data={data} onClose={() => setCreating(false)} onCreated={(id) => setPolicyId(id)} />}
    </section>
  );
}

function NewPolicyDialog({ data, onClose, onCreated }: { data: Config; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useServerFn(createPolicy);
  const refresh = useRefresh();
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState(data.policies[0]?.id ?? '');
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => create({ data: { name: name.trim(), copyFrom } }), onSuccess: async (r) => { toast.success('Política criada.'); await refresh(); onCreated(r.id); onClose(); }, onError: (e) => setError(e.message) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova política de SLA</DialogTitle><DialogDescription>A nova política começa com as metas da política de origem.</DialogDescription></DialogHeader>
        <form id="new-policy" onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2) { setError('Informe o nome.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="np-name">Nome<Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
          <label className="field" htmlFor="np-copy">Copiar metas de<select id="np-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>{data.policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="new-policy" disabled={mutation.isPending}>Criar política</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Calendars({ data }: { data: Config }) {
  const [calendarId, setCalendarId] = useState(data.calendars[0]?.id ?? '');
  const [isNew, setIsNew] = useState(false);
  const calendar = isNew ? undefined : data.calendars.find((c) => c.id === calendarId);
  const [form, setForm] = useState({ name: '', timezone: 'America/Sao_Paulo', workStart: '08:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5] });
  const [error, setError] = useState('');
  const [holiday, setHoliday] = useState({ day: '', description: '' });
  const [holidayError, setHolidayError] = useState('');
  const refresh = useRefresh();
  const save = useServerFn(saveCalendar);
  const add = useServerFn(addHoliday);
  const remove = useServerFn(removeHoliday);
  useEffect(() => {
    if (calendar) setForm({ name: calendar.name, timezone: calendar.timezone, workStart: calendar.work_start.slice(0, 5), workEnd: calendar.work_end.slice(0, 5), workDays: calendar.work_days });
    else if (isNew) setForm({ name: '', timezone: 'America/Sao_Paulo', workStart: '08:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5] });
    setError('');
  }, [calendar, isNew]);
  const saveMutation = useMutation({
    mutationFn: () => save({ data: { id: isNew ? null : calendarId, ...form } }),
    onSuccess: async (r) => { toast.success('Calendário salvo.'); await refresh(); if (r?.id) setCalendarId(r.id); setIsNew(false); },
    onError: (e) => setError(e.message),
  });
  const addMutation = useMutation({ mutationFn: () => add({ data: { calendarId, ...holiday } }), onSuccess: async () => { toast.success('Feriado incluído.'); setHoliday({ day: '', description: '' }); setHolidayError(''); await refresh(); }, onError: (e) => setHolidayError(e.message) });
  const removeMutation = useMutation({ mutationFn: (day: string) => remove({ data: { calendarId, day } }), onSuccess: async () => { toast.success('Feriado removido.'); await refresh(); }, onError: (e) => toast.error(e.message) });
  const holidays = data.holidays.filter((h) => h.calendar_id === calendarId);
  const readOnly = !data.canEdit;
  return (
    <section className="work-section">
      <div className="filter-row">
        <label className="select-field">Calendário<select value={isNew ? '' : calendarId} onChange={(e) => { setIsNew(false); setCalendarId(e.target.value); }}>{isNew && <option value="">Novo calendário</option>}{data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {data.canEdit && <Button variant="outline" onClick={() => setIsNew(true)}><Plus />Novo calendário</Button>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setError(''); if (form.name.trim().length < 2) { setError('Informe o nome.'); return; } if (form.workEnd <= form.workStart) { setError('O fim do expediente deve ser depois do início.'); return; } if (!form.workDays.length) { setError('Selecione ao menos um dia útil.'); return; } saveMutation.mutate(); }}>
        <div className="form-grid">
          <label className="field" htmlFor="cal-name">Nome<Input id="cal-name" value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></label>
          <label className="field" htmlFor="cal-tz">Fuso horário<select id="cal-tz" value={form.timezone} disabled={readOnly} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{[...new Set([form.timezone, ...timezones])].map((t) => <option key={t} value={t}>{t.replace('America/', '').replace('_', ' ')}</option>)}</select></label>
          <label className="field" htmlFor="cal-start">Início do expediente<Input id="cal-start" type="time" value={form.workStart} disabled={readOnly} onChange={(e) => setForm({ ...form, workStart: e.target.value })} /></label>
          <label className="field" htmlFor="cal-end">Fim do expediente<Input id="cal-end" type="time" value={form.workEnd} disabled={readOnly} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} /></label>
        </div>
        <fieldset className="choice-row"><legend className="field-label">Dias úteis</legend>{dayNames.map((d, i) => <label key={d} className={`choice-pill ${form.workDays.includes(i + 1) ? 'is-selected' : ''}`}><input type="checkbox" disabled={readOnly} checked={form.workDays.includes(i + 1)} onChange={(e) => setForm({ ...form, workDays: e.target.checked ? [...form.workDays, i + 1].sort() : form.workDays.filter((x) => x !== i + 1) })} />{d}</label>)}</fieldset>
        <p className="field-hint">Usado por: {data.accounts.filter((a) => a.calendar_id === calendarId && !isNew).map((a) => a.name).join(', ') || 'nenhuma conta'}. Mudanças de expediente afetam prazos calculados a partir de agora.</p>
        <FieldError message={error} />
        {data.canEdit && <Button disabled={saveMutation.isPending}><Save />{saveMutation.isPending ? 'Salvando…' : 'Salvar calendário'}</Button>}
      </form>
      {!isNew && calendarId && (
        <div className="holiday-block">
          <h3>Feriados · {holidays.length}</h3>
          {data.canEdit && (
            <form className="filter-row" onSubmit={(e) => { e.preventDefault(); setHolidayError(''); if (!holiday.day) { setHolidayError('Informe a data.'); return; } if (holiday.description.trim().length < 2) { setHolidayError('Descreva o feriado.'); return; } addMutation.mutate(); }}>
              <label className="select-field">Data<Input type="date" value={holiday.day} onChange={(e) => setHoliday({ ...holiday, day: e.target.value })} /></label>
              <label className="select-field grow">Descrição<Input value={holiday.description} onChange={(e) => setHoliday({ ...holiday, description: e.target.value })} maxLength={120} placeholder="Ex.: Carnaval" /></label>
              <Button variant="outline" disabled={addMutation.isPending}><Plus />Incluir feriado</Button>
            </form>
          )}
          <FieldError message={holidayError} />
          {holidays.length ? <ul className="file-list">{holidays.map((h) => <li key={h.day}><span><span className="font-mono">{formatDate(h.day)}</span> · {h.description}</span>{data.canEdit && <Button variant="ghost" size="icon" aria-label={`Remover feriado ${formatDate(h.day)}`} disabled={removeMutation.isPending} onClick={() => { if (window.confirm(`Remover o feriado de ${formatDate(h.day)}?`)) removeMutation.mutate(h.day); }}><Trash2 /></Button>}</li>)}</ul> : <p className="empty-row">Nenhum feriado cadastrado.</p>}
        </div>
      )}
    </section>
  );
}

function Categories({ data }: { data: Config }) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; parentId: string | null; active: boolean } | null>(null);
  const [error, setError] = useState('');
  const refresh = useRefresh();
  const save = useServerFn(saveCategory);
  const mutation = useMutation({ mutationFn: () => save({ data: editing! }), onSuccess: async () => { toast.success('Categoria salva.'); setEditing(null); await refresh(); }, onError: (e) => setError(e.message) });
  const roots = data.categories.filter((c) => !c.parent_id);
  return (
    <section className="work-section">
      {data.canEdit && <div className="filter-row"><Button variant="outline" onClick={() => { setError(''); setEditing({ id: null, name: '', parentId: null, active: true }); }}><Plus />Nova categoria</Button></div>}
      <ul className="category-tree">
        {roots.map((r) => (
          <li key={r.id}>
            <div className="category-row"><strong>{r.name}</strong>{!r.active && <span className="state-badge state-pause">inativa</span>}{data.canEdit && <><Button variant="ghost" size="sm" onClick={() => { setError(''); setEditing({ id: r.id, name: r.name, parentId: null, active: r.active }); }}>Editar</Button><Button variant="ghost" size="sm" onClick={() => { setError(''); setEditing({ id: null, name: '', parentId: r.id, active: true }); }}><Plus />Subcategoria</Button></>}</div>
            <ul>{data.categories.filter((c) => c.parent_id === r.id).map((c) => <li key={c.id} className="category-row"><span>{c.name}</span>{!c.active && <span className="state-badge state-pause">inativa</span>}{data.canEdit && <Button variant="ghost" size="sm" onClick={() => { setError(''); setEditing({ id: c.id, name: c.name, parentId: r.id, active: c.active }); }}>Editar</Button>}</li>)}</ul>
          </li>
        ))}
      </ul>
      <p className="field-hint">Categorias inativas deixam de aparecer no registro, mas permanecem nas ocorrências antigas e nos indicadores.</p>
      {editing && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditing(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? 'Editar categoria' : editing.parentId ? 'Nova subcategoria' : 'Nova categoria'}</DialogTitle><DialogDescription>{editing.parentId ? `Dentro de ${roots.find((r) => r.id === editing.parentId)?.name ?? ''}.` : 'Categoria principal usada no Pareto de causas.'}</DialogDescription></DialogHeader>
            <form id="category-form" onSubmit={(e) => { e.preventDefault(); if (editing.name.trim().length < 2) { setError('Informe o nome.'); return; } mutation.mutate(); }}>
              <label className="field" htmlFor="cat-name">Nome<Input id="cat-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} /></label>
              <label className="check-field"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />Ativa</label>
              <FieldError message={error} />
            </form>
            <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" form="category-form" disabled={mutation.isPending}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function Audit({ data }: { data: Config }) {
  return (
    <section className="work-section">
      <div className="table-scroll">
        <table className="atlas-table">
          <thead><tr><th>Quando</th><th>Quem</th><th>Cadastro</th><th>Operação</th><th>Detalhe</th></tr></thead>
          <tbody>{data.audit.map((a) => <tr key={a.id}><td className="font-mono">{formatDateTime(a.created_at)}</td><td>{a.actor_id ? data.actors[a.actor_id] ?? 'Usuário' : 'Sistema'}</td><td>{tableLabels[a.table_name] ?? a.table_name}</td><td>{actionNames[a.action] ?? a.action}</td><td className="audit-detail">{a.note ?? summarize(a.new_data ?? a.old_data)}</td></tr>)}</tbody>
        </table>
      </div>
      {!data.audit.length && <p className="empty-row">Nenhuma alteração registrada.</p>}
    </section>
  );
}
function summarize(v: unknown) {
  if (!v || typeof v !== 'object') return '—';
  const r = v as Record<string, unknown>;
  return String(r['name'] ?? r['description'] ?? r['severity'] ?? r['role'] ?? r['day'] ?? '—');
}
