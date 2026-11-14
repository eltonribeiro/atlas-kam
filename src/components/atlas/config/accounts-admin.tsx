import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Building2, Pencil, Plus, ShieldOff, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { anonymizeContact, getAccountsOverview, inviteStaff, saveAccount, saveContact, setMembership, setStaffActive, setStaffRole, type StaffMember } from '@/lib/accounts.functions';
import { FieldError, PageHeading, roleLabels } from '../occurrence-ui';

export const accountsOverviewOptions = queryOptions({ queryKey: ['accounts-overview'], queryFn: () => getAccountsOverview() });
type Overview = Awaited<ReturnType<typeof getAccountsOverview>>;
type Account = Overview['accounts'][number];
type Contact = Overview['contacts'][number];

function useRefresh() {
  const qc = useQueryClient();
  return async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['accounts-overview'] }), qc.invalidateQueries({ queryKey: ['occurrence-catalog'] }), qc.invalidateQueries({ queryKey: ['sla-config'] })]); };
}

export function AccountsAdmin() {
  const { data } = useSuspenseQuery(accountsOverviewOptions);
  return (
    <main className="atlas-main">
      <PageHeading eyebrow="CONTAS-CHAVE" title="Contas" subtitle={data.isAdmin ? 'Contas, contatos autorizados, equipe e alocação. Perfis de acesso são definidos somente aqui.' : 'Contas da sua carteira, contatos e contrato de SLA aplicado.'} />
      {data.isAdmin ? (
        <Tabs defaultValue="accounts">
          <TabsList className="atlas-tabs" aria-label="Cadastros"><TabsTrigger value="accounts">Contas e contatos</TabsTrigger><TabsTrigger value="staff">Equipe e acessos</TabsTrigger></TabsList>
          <TabsContent value="accounts"><AccountsTab data={data} /></TabsContent>
          <TabsContent value="staff"><StaffTab data={data} /></TabsContent>
        </Tabs>
      ) : <AccountsTab data={data} />}
    </main>
  );
}

function AccountsTab({ data }: { data: Overview }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [contact, setContact] = useState<{ accountId: string; contact?: Contact | undefined } | null>(null);
  const [anonymizing, setAnonymizing] = useState<Contact | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = data.accounts.filter((a) => !a.active).length;
  const visibleAccounts = showInactive ? data.accounts : data.accounts.filter((a) => a.active);
  const policy = Object.fromEntries(data.policies.map((p) => [p.id, p.name]));
  const calendar = Object.fromEntries(data.calendars.map((c) => [c.id, c.name]));
  const staffNames = Object.fromEntries(data.staff.map((s) => [s.id, s.full_name]));
  if (!data.accounts.length) {
    return <div className="data-message"><Building2 size={28} /><h2>Nenhuma conta liberada</h2><p>{data.isAdmin ? 'Cadastre a primeira conta-chave.' : 'Peça ao administrador a alocação nas suas contas.'}</p>{data.isAdmin && <Button onClick={() => setEditing('new')}><Plus />Nova conta</Button>}{editing && <AccountDialog data={data} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}</div>;
  }
  return (
    <>
      {(data.isAdmin || inactiveCount > 0) && <div className="filter-row">{data.isAdmin && <Button onClick={() => setEditing('new')}><Plus />Nova conta</Button>}{inactiveCount > 0 && <label className="check-field"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Mostrar contas inativas ({inactiveCount})</label>}</div>}
      {!visibleAccounts.length && <p className="empty-row">Todas as contas estão inativas. Marque “Mostrar contas inativas” para consultá-las.</p>}
      <div className="account-grid">
        {visibleAccounts.map((a) => {
          const contacts = data.contacts.filter((c) => c.account_id === a.id);
          const members = data.staff.filter((s) => s.accounts.includes(a.id));
          return (
            <section key={a.id} className="work-section account-card">
              <div className="section-title"><h2>{a.name}</h2><div className="heading-actions">{!a.active && <span className="state-badge state-pause">inativa</span>}{data.isAdmin && <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Pencil />Editar</Button>}</div></div>
              <dl className="inline-dl">
                <dt>KAM</dt><dd>{a.kam_id ? staffNames[a.kam_id] ?? data.kamNames[a.kam_id] ?? '—' : <span className="state-badge state-risk">sem KAM</span>}</dd>
                <dt>Política de SLA</dt><dd>{policy[a.sla_policy_id] ?? '—'}</dd>
                <dt>Calendário</dt><dd>{calendar[a.calendar_id] ?? '—'}</dd>
              </dl>
              <h3>Contatos autorizados · {contacts.filter((c) => c.active).length}</h3>
              <ul className="contact-list">
                {contacts.map((c) => (
                  <li key={c.id} className={c.active ? '' : 'is-inactive'}>
                    <span><strong>{c.name}</strong>{c.job_title ? ` · ${c.job_title}` : ''}{data.isAdmin && c.email ? <span className="table-secondary">{c.email}</span> : null}{!c.active && <span className="state-badge state-pause">inativo</span>}</span>
                    {data.isAdmin && <span className="heading-actions"><Button size="icon" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setContact({ accountId: a.id, contact: c })}><Pencil /></Button>{c.active && <Button size="icon" variant="ghost" aria-label={`Anonimizar ${c.name}`} title="Anonimizar (LGPD)" onClick={() => setAnonymizing(c)}><ShieldOff /></Button>}</span>}
                  </li>
                ))}
              </ul>
              {data.isAdmin && <Button size="sm" variant="outline" onClick={() => setContact({ accountId: a.id })}><Plus />Novo contato</Button>}
              {data.isAdmin && <Membership account={a} members={members} staff={data.staff} />}
            </section>
          );
        })}
      </div>
      {editing && <AccountDialog data={data} account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {contact && <ContactDialog accountId={contact.accountId} contact={contact.contact} onClose={() => setContact(null)} />}
      {anonymizing && <AnonymizeDialog contact={anonymizing} onClose={() => setAnonymizing(null)} />}
    </>
  );
}

function Membership({ account, members, staff }: { account: Account; members: StaffMember[]; staff: StaffMember[] }) {
  const set = useServerFn(setMembership);
  const refresh = useRefresh();
  const [adding, setAdding] = useState('');
  const mutation = useMutation({ mutationFn: (v: { userId: string; member: boolean }) => set({ data: { accountId: account.id, ...v } }), onSuccess: async (_r, v) => { toast.success(v.member ? 'Pessoa alocada na conta.' : 'Alocação removida.'); setAdding(''); await refresh(); }, onError: (e) => toast.error(e.message) });
  const candidates = staff.filter((s) => s.active && s.role && s.role !== 'admin' && !s.accounts.includes(account.id));
  return (
    <div className="membership">
      <h3>Equipe alocada · {members.length}</h3>
      <ul className="contact-list">{members.map((m) => <li key={m.id}><span><strong>{m.full_name}</strong> · {roleLabels[m.role ?? ''] ?? 'sem perfil'}{m.id === account.kam_id ? ' · KAM da conta' : ''}</span><Button size="sm" variant="ghost" disabled={mutation.isPending || m.id === account.kam_id} onClick={() => mutation.mutate({ userId: m.id, member: false })}>Remover</Button></li>)}</ul>
      <div className="filter-row">
        <label className="select-field grow">Alocar pessoa<select value={adding} onChange={(e) => setAdding(e.target.value)}><option value="">Selecionar</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name} · {roleLabels[c.role ?? '']}</option>)}</select></label>
        <Button variant="outline" size="sm" disabled={!adding || mutation.isPending} onClick={() => mutation.mutate({ userId: adding, member: true })}>Alocar</Button>
      </div>
    </div>
  );
}

function AccountDialog({ data, account, onClose }: { data: Overview; account: Account | null; onClose: () => void }) {
  const save = useServerFn(saveAccount);
  const refresh = useRefresh();
  const [form, setForm] = useState({ name: account?.name ?? '', kamId: account?.kam_id ?? '', calendarId: account?.calendar_id ?? data.calendars[0]?.id ?? '', policyId: account?.sla_policy_id ?? data.policies[0]?.id ?? '', active: account?.active ?? true });
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => save({ data: { id: account?.id ?? null, name: form.name.trim(), kamId: form.kamId || null, calendarId: form.calendarId, policyId: form.policyId, active: form.active } }), onSuccess: async () => { toast.success('Conta salva.'); await refresh(); onClose(); }, onError: (e) => setError(e.message) });
  const kams = data.staff.filter((s) => s.role === 'kam' && s.active);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? `Editar ${account.name}` : 'Nova conta'}</DialogTitle><DialogDescription>O KAM é alocado automaticamente na conta e recebe cópia das comunicações ao cliente.</DialogDescription></DialogHeader>
        <form id="account-form" onSubmit={(e) => { e.preventDefault(); if (form.name.trim().length < 2) { setError('Informe o nome da conta.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="acc-name">Nome<Input id="acc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></label>
          <label className="field" htmlFor="acc-kam">KAM<select id="acc-kam" value={form.kamId} onChange={(e) => setForm({ ...form, kamId: e.target.value })}><option value="">Sem KAM</option>{kams.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></label>
          <div className="form-grid">
            <label className="field" htmlFor="acc-policy">Política de SLA<select id="acc-policy" value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })}>{data.policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="field" htmlFor="acc-calendar">Calendário<select id="acc-calendar" value={form.calendarId} onChange={(e) => setForm({ ...form, calendarId: e.target.value })}>{data.calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Conta ativa</label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="account-form" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Salvar conta'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ accountId, contact, onClose }: { accountId: string; contact?: Contact | undefined; onClose: () => void }) {
  const save = useServerFn(saveContact);
  const refresh = useRefresh();
  const [form, setForm] = useState({ name: contact?.name ?? '', email: contact?.email ?? '', jobTitle: contact?.job_title ?? '', active: contact?.active ?? true });
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => save({ data: { id: contact?.id ?? null, accountId, ...form } }), onSuccess: async () => { toast.success('Contato salvo.'); await refresh(); onClose(); }, onError: (e) => setError(e.message) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact ? 'Editar contato' : 'Novo contato autorizado'}</DialogTitle><DialogDescription>Contatos recebem as comunicações das ocorrências que reportarem.</DialogDescription></DialogHeader>
        <form id="contact-form" onSubmit={(e) => { e.preventDefault(); if (form.name.trim().length < 2) { setError('Informe o nome.'); return; } if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Informe um e-mail válido.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="ct-name">Nome<Input id="ct-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} /></label>
          <label className="field" htmlFor="ct-email">E-mail<Input id="ct-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} /></label>
          <label className="field" htmlFor="ct-title">Cargo<Input id="ct-title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} maxLength={120} /></label>
          <label className="check-field"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Contato ativo</label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="contact-form" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Salvar contato'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnonymizeDialog({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const run = useServerFn(anonymizeContact);
  const refresh = useRefresh();
  const [reference, setReference] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => run({ data: { id: contact.id, reference: reference.trim() } }), onSuccess: async () => { toast.success('Contato anonimizado.'); await refresh(); onClose(); }, onError: (e) => setError(e.message) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anonimizar {contact.name}</DialogTitle><DialogDescription>Atende ao pedido do titular (LGPD): nome, e-mail e cargo são substituídos e o contato fica inativo. As ocorrências e indicadores são preservados. Não pode ser desfeito.</DialogDescription></DialogHeader>
        <form id="anon-form" onSubmit={(e) => { e.preventDefault(); if (reference.trim().length < 3) { setError('Informe a referência do pedido do titular.'); return; } if (!confirm) { setError('Confirme que deseja anonimizar.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="anon-ref">Referência do pedido<Input id="anon-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} placeholder="Ex.: protocolo do DPO ou e-mail do pedido" /></label>
          <label className="check-field"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Entendo que a anonimização é definitiva</label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="anon-form" variant="destructive" disabled={mutation.isPending}>Anonimizar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StaffTab({ data }: { data: Overview }) {
  const [inviting, setInviting] = useState(false);
  const role = useServerFn(setStaffRole);
  const active = useServerFn(setStaffActive);
  const refresh = useRefresh();
  const roleMutation = useMutation({ mutationFn: (v: { userId: string; role: 'analyst' | 'kam' | 'ops_manager' | 'admin' }) => role({ data: v }), onSuccess: async () => { toast.success('Perfil atualizado.'); await refresh(); }, onError: async (e) => { toast.error(e.message); await refresh(); } });
  const activeMutation = useMutation({ mutationFn: (v: { userId: string; active: boolean }) => active({ data: v }), onSuccess: async (_r, v) => { toast.success(v.active ? 'Acesso reativado.' : 'Acesso desativado.'); await refresh(); }, onError: (e) => toast.error(e.message) });
  const accountNames = Object.fromEntries(data.accounts.map((a) => [a.id, a.name]));
  return (
    <section className="work-section">
      <div className="filter-row"><Button onClick={() => setInviting(true)}><UserPlus />Convidar pessoa</Button><span className="field-hint">O convite chega por e-mail com o link para definir a senha.</span></div>
      <div className="table-scroll">
        <table className="atlas-table">
          <thead><tr><th>Pessoa</th><th>Perfil</th><th>Contas</th><th>Acesso</th></tr></thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'is-inactive'}>
                <td><strong>{s.full_name}</strong><span className="table-secondary">{s.email}</span></td>
                <td><select aria-label={`Perfil de ${s.full_name}`} value={s.role ?? ''} disabled={s.id === data.userId || roleMutation.isPending} onChange={(e) => roleMutation.mutate({ userId: s.id, role: e.target.value as 'analyst' })}>{!s.role && <option value="">Sem perfil</option>}{Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td>{s.accounts.map((a) => accountNames[a]).filter(Boolean).join(', ') || <span className="text-muted-foreground">nenhuma</span>}</td>
                <td>{s.id === data.userId ? <span className="text-muted-foreground">você</span> : <Button size="sm" variant={s.active ? 'ghost' : 'outline'} disabled={activeMutation.isPending} onClick={() => { if (!s.active || window.confirm(`Desativar o acesso de ${s.full_name}?`)) activeMutation.mutate({ userId: s.id, active: !s.active }); }}>{s.active ? 'Desativar' : 'Reativar'}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </section>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const invite = useServerFn(inviteStaff);
  const refresh = useRefresh();
  const [form, setForm] = useState<{ fullName: string; email: string; role: 'analyst' | 'kam' | 'ops_manager' | 'admin' }>({ fullName: '', email: '', role: 'analyst' });
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => invite({ data: form }), onSuccess: async () => { toast.success(`Convite enviado para ${form.email}.`, { description: 'Aloque a pessoa nas contas em “Contas e contatos”.' }); await refresh(); onClose(); }, onError: (e) => setError(e.message) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar pessoa</DialogTitle><DialogDescription>O perfil define o que a pessoa pode fazer; as contas visíveis dependem da alocação.</DialogDescription></DialogHeader>
        <form id="invite-form" onSubmit={(e) => { e.preventDefault(); if (form.fullName.trim().length < 3) { setError('Informe o nome completo.'); return; } if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Informe um e-mail corporativo válido.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="inv-name">Nome completo<Input id="inv-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={120} /></label>
          <label className="field" htmlFor="inv-email">E-mail corporativo<Input id="inv-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} /></label>
          <label className="field" htmlFor="inv-role">Perfil<select id="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>{Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="invite-form" disabled={mutation.isPending}>{mutation.isPending ? 'Enviando…' : 'Enviar convite'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
