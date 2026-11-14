import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createProblem } from '@/lib/problems.functions';
import { problemListOptions, type ProblemFilters } from '@/lib/problem-queries';
import { ErrorState, FieldError, PageHeading, formatDate, problemStatusLabels, todayInSaoPaulo } from '../occurrence-ui';
import { TableSkeleton } from '../occurrence-list';

const statusFilters: { value: NonNullable<ProblemFilters['status']>; label: string }[] = [
  { value: 'active', label: 'Ativos' }, { value: 'open', label: 'Abertos' }, { value: 'analysis', label: 'Em análise' }, { value: 'action_plan', label: 'Plano de ação' },
  { value: 'effectiveness_check', label: 'Eficácia' }, { value: 'closed', label: 'Encerrados' }, { value: 'cancelled', label: 'Cancelados' }, { value: 'all', label: 'Todos' },
];

export function ProblemList() {
  const search = useSearch({ from: '/_authenticated/problemas/' });
  const navigate = useNavigate({ from: '/problemas/' });
  const q = useQuery({ ...problemListOptions(search), placeholderData: keepPreviousData });
  const [dialog, setDialog] = useState(false);
  const update = (patch: Partial<ProblemFilters>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const canCreate = q.data?.role === 'kam' || q.data?.role === 'ops_manager';
  const today = todayInSaoPaulo();
  return (
    <main className="atlas-main">
      <PageHeading eyebrow="ANÁLISE DE CAUSA RAIZ" title="Problemas" subtitle="Ocorrências recorrentes agrupadas por causa, com plano de ação e verificação de eficácia." actions={canCreate ? <Button onClick={() => setDialog(true)}><Plus />Novo problema</Button> : undefined} />
      <section className="work-section">
        <div className="period-chips" role="group" aria-label="Situação">{statusFilters.map((s) => <Button key={s.value} size="sm" variant={(search.status ?? 'active') === s.value ? 'default' : 'outline'} aria-pressed={(search.status ?? 'active') === s.value} onClick={() => update({ status: s.value === 'active' ? undefined : s.value })}>{s.label}</Button>)}</div>
        <div className="filter-row">
          <label className="select-field">Conta<select value={search.account ?? ''} onChange={(e) => update({ account: e.target.value || undefined })}><option value="">Todas</option>{q.data?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="select-field">Dono<select value={search.owner ?? ''} onChange={(e) => update({ owner: e.target.value || undefined })}><option value="">Todos</option>{q.data?.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          {q.isFetching && q.data && <span className="text-muted-foreground" aria-live="polite">atualizando…</span>}
        </div>
        {q.error ? <ErrorState error={q.error} retry={() => void q.refetch()} /> : !q.data ? <TableSkeleton /> : (
          <>
            <div className="table-scroll">
              <table className="atlas-table">
                <thead><tr><th>Código</th><th>Problema</th><th>Conta</th><th>Status</th><th>Dono</th><th>Ocorrências</th><th>Ações</th><th>Eficácia</th></tr></thead>
                <tbody>
                  {q.data.rows.map((p) => (
                    <tr key={p.id ?? ''}>
                      <td><Link className="protocol-link" to="/problemas/$id" params={{ id: p.id ?? '' }}>{p.code}</Link></td>
                      <td><strong>{p.title}</strong><span className="table-secondary">{p.category_name ?? 'Todas as categorias'}</span></td>
                      <td>{p.account_name ?? 'Entre contas'}</td>
                      <td><span className={`state-badge ${p.status === 'closed' ? 'state-ok' : p.status === 'cancelled' ? 'state-pause' : 'state-neutral'}`}>{problemStatusLabels[p.status ?? '']}</span></td>
                      <td>{p.owner_name ?? <span className="state-badge state-risk">sem dono</span>}</td>
                      <td className="font-mono">{p.occurrence_count}</td>
                      <td className="font-mono">{p.actions_done}/{p.actions_total}</td>
                      <td>{p.effectiveness_effective === true ? <span className="state-badge state-ok">Efetiva</span> : p.status === 'effectiveness_check' && p.effectiveness_due_date ? <span className={`state-badge ${p.effectiveness_due_date <= today ? 'state-risk' : 'state-neutral'}`}>verificar {formatDate(p.effectiveness_due_date)}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!q.data.rows.length && <div className="data-message"><SearchCheck size={28} /><h2>Nenhum problema nesta situação</h2><p>Problemas são abertos a partir de ocorrências recorrentes ou pelo KAM e gestor.</p></div>}
          </>
        )}
      </section>
      {dialog && q.data && <NewProblemDialog accounts={q.data.accounts} categories={q.data.categories} role={q.data.role} onClose={() => setDialog(false)} />}
    </main>
  );
}

function NewProblemDialog({ accounts, categories, role, onClose }: { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[]; role: string | null; onClose: () => void }) {
  const create = useServerFn(createProblem);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [account, setAccount] = useState(accounts.length === 1 ? (accounts[0]?.id ?? '') : '');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => create({ data: { title: title.trim(), accountId: account || null, categoryId: category || null, occurrenceId: null } }),
    onSuccess: async (r) => { toast.success('Problema aberto.'); await qc.invalidateQueries({ queryKey: ['problems'] }); onClose(); await navigate({ to: '/problemas/$id', params: { id: r.id } }); },
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo problema</DialogTitle><DialogDescription>Agrupe ocorrências da mesma causa para análise de causa raiz.</DialogDescription></DialogHeader>
        <form id="new-problem" onSubmit={(e) => { e.preventDefault(); if (title.trim().length < 5) { setError('O título precisa de pelo menos 5 caracteres.'); return; } if (!account && role !== 'ops_manager') { setError('Selecione a conta.'); return; } mutation.mutate(); }}>
          <label className="field" htmlFor="np-title">Título<Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Ex.: avarias recorrentes no carregamento" /></label>
          <label className="field" htmlFor="np-account">Conta<select id="np-account" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">{role === 'ops_manager' ? 'Entre contas (gestor)' : 'Selecionar conta'}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="field" htmlFor="np-category">Categoria<select id="np-category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="new-problem" disabled={mutation.isPending}>{mutation.isPending ? 'Abrindo…' : 'Abrir problema'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
