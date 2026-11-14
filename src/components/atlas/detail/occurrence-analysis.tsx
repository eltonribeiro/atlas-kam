import { useRef, useState, type FormEvent } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addAction, addCause, completeAction, updateCause } from '@/lib/occurrences.functions';
import { uploadEvidence } from '@/lib/attachments.functions';
import { EVIDENCE_ACCEPT, evidenceProblem } from '@/lib/evidence-rules';
import { FieldError, actionLabels, causeStatusLabels, downloadCsv, formatDate, sixMLabels, todayInSaoPaulo } from '../occurrence-ui';

type Cause = { id: string; code: string; description: string; kind: 'root' | 'contributing'; status: 'hypothesis' | 'validating' | 'confirmed' | 'discarded'; category: keyof typeof sixMLabels | null; evidence: string | null; whys: string[] };
type Action = { id: string; type: string; what: string; why: string | null; where_text: string | null; how: string | null; how_much: number | null; owner_id: string; due_date: string; status: string; done_at: string | null; evidence_note: string | null; cause_id: string | null; gates_solution: boolean | null };
type Member = { id: string; full_name: string; role: string };

export type AnalysisProps = {
  scope: { occurrenceId: string | null; problemId: string | null };
  causes: Cause[];
  actions: Action[];
  team: Member[];
  canEdit: boolean;
  invalidate: () => Promise<void>;
  eightD?: { team: string; problem: string; closure: string };
  exportName: string;
  allowEvidenceUpload?: boolean;
};

export function AnalysisSection(props: AnalysisProps) {
  const [causeSheet, setCauseSheet] = useState<{ cause?: Cause; category?: Cause['category'] } | null>(null);
  const [actionSheet, setActionSheet] = useState(false);
  const [completing, setCompleting] = useState<Action | null>(null);
  const names = Object.fromEntries(props.team.map((m) => [m.id, m.full_name]));
  const causeCode = Object.fromEntries(props.causes.map((c) => [c.id, c.code]));
  const today = todayInSaoPaulo();
  const done = props.actions.filter((a) => a.status === 'done').length;

  return (
    <section className="work-section" aria-labelledby="analysis-title">
      <div className="section-title">
        <h2 id="analysis-title">Análise de causa e plano de ação</h2>
        {props.canEdit && <div className="heading-actions"><Button variant="outline" onClick={() => setCauseSheet({})}><Plus />Adicionar causa</Button><Button variant="outline" onClick={() => setActionSheet(true)}><Plus />Adicionar ação</Button></div>}
      </div>
      <Tabs defaultValue="whys">
        <TabsList aria-label="Método de análise"><TabsTrigger value="whys">5 Porquês</TabsTrigger><TabsTrigger value="ishikawa">Ishikawa 6M</TabsTrigger><TabsTrigger value="8d">8D</TabsTrigger></TabsList>
        <TabsContent value="whys">
          {!props.causes.length ? <p className="empty-row">Nenhuma causa registrada. Comece pela hipótese mais provável e confirme com evidência.</p> : (
            <div className="cause-list">
              {props.causes.map((c) => (
                <article className={`cause-item ${c.status === 'discarded' ? 'is-discarded' : ''}`} key={c.id}>
                  <div className="cause-head"><strong className="font-mono">{c.code}</strong><span>{c.kind === 'root' ? 'Causa raiz' : 'Contribuinte'}{c.category ? ` · ${sixMLabels[c.category]}` : ''}</span><span className={`state-badge ${c.status === 'confirmed' ? 'state-ok' : c.status === 'discarded' ? 'state-pause' : 'state-neutral'}`}>{causeStatusLabels[c.status]}</span>{props.canEdit && <Button size="icon" variant="ghost" aria-label={`Editar ${c.code}`} onClick={() => setCauseSheet({ cause: c })}><Pencil /></Button>}</div>
                  <p>{c.description}</p>
                  {c.evidence && <p className="text-muted-foreground">Evidência: {c.evidence}</p>}
                  {c.whys.length > 0 && <ol className="whys-chain">{c.whys.map((w, i) => <li key={i}><span className="font-mono">Por quê {i + 1}</span>{w}</li>)}</ol>}
                </article>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="ishikawa">
          <div className="ishikawa-grid">
            {(Object.keys(sixMLabels) as (keyof typeof sixMLabels)[]).map((k) => {
              const items = props.causes.filter((c) => c.category === k && c.status !== 'discarded');
              return (
                <div key={k} className="ishikawa-box">
                  <div className="section-title"><strong>{sixMLabels[k]}</strong>{props.canEdit && <Button size="icon" variant="ghost" aria-label={`Adicionar causa em ${sixMLabels[k]}`} onClick={() => setCauseSheet({ category: k })}><Plus /></Button>}</div>
                  {items.length ? <ul>{items.map((c) => <li key={c.id}><span className="font-mono">{c.code}</span> {c.description}{c.status === 'confirmed' ? ' ✓' : ''}</li>)}</ul> : <p className="text-muted-foreground">Sem causas.</p>}
                </div>
              );
            })}
          </div>
          {props.causes.some((c) => !c.category) && <p className="field-hint">{props.causes.filter((c) => !c.category).length} causa(s) sem categoria 6M. Edite a causa para classificá-la.</p>}
        </TabsContent>
        <TabsContent value="8d">
          <dl className="eight-d">
            <dt>D1 · Equipe</dt><dd>{props.eightD?.team || props.team.map((m) => m.full_name).join(', ') || '—'}</dd>
            <dt>D2 · Problema</dt><dd>{props.eightD?.problem || '—'}</dd>
            <dt>D3 · Contenção</dt><dd>{list(props.actions.filter((a) => a.type === 'containment'))}</dd>
            <dt>D4 · Causa raiz</dt><dd>{props.causes.filter((c) => c.kind === 'root' && c.status === 'confirmed').map((c) => `${c.code} · ${c.description}`).join('; ') || 'Não confirmada'}</dd>
            <dt>D5/D6 · Ações corretivas</dt><dd>{list(props.actions.filter((a) => a.type === 'corrective' || a.type === 'correction'))}</dd>
            <dt>D7 · Prevenção</dt><dd>{list(props.actions.filter((a) => a.type === 'preventive'))}</dd>
            <dt>D8 · Encerramento</dt><dd>{props.eightD?.closure || '—'}</dd>
          </dl>
        </TabsContent>
      </Tabs>

      <div className="section-title plan-title">
        <h3>Plano de ação · 5W2H <span className="font-mono text-muted-foreground">{done} de {props.actions.length} concluídas</span></h3>
        <Button variant="ghost" size="sm" disabled={!props.actions.length} onClick={() => downloadCsv(`${props.exportName}-plano-de-acao.csv`, ['Tipo', 'O quê', 'Por quê', 'Onde', 'Quem', 'Quando', 'Como', 'Quanto (R$)', 'Causa', 'Status', 'Concluída em', 'Evidência'], props.actions.map((a) => [actionLabels[a.type], a.what, a.why, a.where_text, names[a.owner_id] ?? '', a.due_date, a.how, a.how_much, a.cause_id ? causeCode[a.cause_id] : 'Sintoma', a.status === 'done' ? 'Concluída' : a.status === 'cancelled' ? 'Cancelada' : 'Aberta', a.done_at ? formatDate(a.done_at) : '', a.evidence_note]))}><Download />Exportar para planilha</Button>
      </div>
      <div className="table-scroll">
        <table className="atlas-table">
          <thead><tr><th>Concluída</th><th>Tipo</th><th>O quê</th><th>Quem</th><th>Até</th><th>Trata</th><th>Efeito</th></tr></thead>
          <tbody>
            {props.actions.map((a) => {
              const late = a.status !== 'done' && a.status !== 'cancelled' && a.due_date < today;
              return (
                <tr key={a.id}>
                  <td>{a.status === 'done' ? <span className="state-badge state-ok"><Check size={12} />{formatDate(a.done_at)}</span> : <Button size="sm" variant="outline" disabled={!props.canEdit} onClick={() => setCompleting(a)}>Concluir</Button>}</td>
                  <td>{actionLabels[a.type]}</td>
                  <td><strong>{a.what}</strong>{(a.why || a.how || a.where_text) && <span className="table-secondary">{[a.why && `Por quê: ${a.why}`, a.where_text && `Onde: ${a.where_text}`, a.how && `Como: ${a.how}`].filter(Boolean).join(' · ')}</span>}{a.evidence_note && <span className="table-secondary">Evidência: {a.evidence_note}</span>}</td>
                  <td>{names[a.owner_id] ?? '—'}</td>
                  <td className="font-mono">{formatDate(a.due_date)}{late && <span className="state-badge state-breach">Atrasada</span>}</td>
                  <td className="font-mono">{a.cause_id ? causeCode[a.cause_id] ?? 'Causa' : 'Sintoma'}</td>
                  <td>{a.gates_solution ? 'Libera a solução' : a.type === 'preventive' ? 'Evita recorrência' : 'Melhoria'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!props.actions.length && <p className="empty-row">Nenhuma ação cadastrada. Comece pela contenção: o que evita que o cliente seja afetado de novo agora?</p>}

      {causeSheet && <CauseSheet {...props} initial={causeSheet} onClose={() => setCauseSheet(null)} />}
      {actionSheet && <ActionSheet {...props} onClose={() => setActionSheet(false)} />}
      {completing && <CompleteActionDialog {...props} action={completing} onClose={() => setCompleting(null)} />}
    </section>
  );
}

function list(actions: Action[]) {
  return actions.length ? actions.map((a) => `${a.what} (${a.status === 'done' ? 'concluída' : `até ${formatDate(a.due_date)}`})`).join('; ') : '—';
}

function CauseSheet({ scope, invalidate, initial, onClose }: AnalysisProps & { initial: { cause?: Cause; category?: Cause['category'] }; onClose: () => void }) {
  const create = useServerFn(addCause);
  const update = useServerFn(updateCause);
  const c = initial.cause;
  const [whys, setWhys] = useState<string[]>(c?.whys.length ? c.whys : ['']);
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: async (fields: { description: string; kind: Cause['kind']; status: Cause['status']; category: Cause['category']; evidence: string; whys: string[] }) => (c ? update({ data: { id: c.id, ...fields } }) : create({ data: { ...scope, ...fields } })),
    onSuccess: async () => { toast.success(c ? 'Causa atualizada.' : 'Causa registrada.'); await invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const status = f.get('status') as Cause['status'];
    const evidence = String(f.get('evidence') ?? '').trim();
    const description = String(f.get('description') ?? '').trim();
    if (description.length < 3) { setError('Descreva a causa.'); return; }
    if (status === 'confirmed' && !evidence) { setError('Para confirmar a causa, registre a evidência que a comprova.'); return; }
    mutation.mutate({ description, kind: f.get('kind') as Cause['kind'], status, category: (String(f.get('category') ?? '') || null) as Cause['category'], evidence, whys: whys.map((w) => w.trim()).filter(Boolean) });
  }
  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sheet-wide">
        <SheetHeader><SheetTitle>{c ? `Editar causa ${c.code}` : 'Nova causa'}</SheetTitle><SheetDescription>Hipóteses viram causa confirmada somente com evidência.</SheetDescription></SheetHeader>
        <form className="sheet-form" onSubmit={submit}>
          <label className="field" htmlFor="cause-description">Descrição<Textarea id="cause-description" name="description" defaultValue={c?.description} required rows={3} /></label>
          <div className="form-grid">
            <label className="field" htmlFor="cause-kind">Tipo<select id="cause-kind" name="kind" defaultValue={c?.kind ?? 'root'}><option value="root">Causa raiz</option><option value="contributing">Contribuinte</option></select></label>
            <label className="field" htmlFor="cause-status">Estado<select id="cause-status" name="status" defaultValue={c?.status ?? 'hypothesis'}>{Object.entries(causeStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field" htmlFor="cause-category">Categoria 6M<select id="cause-category" name="category" defaultValue={c?.category ?? initial.category ?? ''}><option value="">Sem categoria</option>{Object.entries(sixMLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <label className="field" htmlFor="cause-evidence">Evidência<Textarea id="cause-evidence" name="evidence" defaultValue={c?.evidence ?? ''} rows={2} placeholder="Dado, registro ou observação que comprova a causa" /></label>
          <fieldset className="whys-editor"><legend>5 Porquês</legend>
            {whys.map((w, i) => (
              <div key={i} className="why-row"><span className="font-mono">{i + 1}</span><Input aria-label={`Por quê ${i + 1}`} value={w} onChange={(e) => setWhys((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'Por que o problema aconteceu?' : 'Por que isso aconteceu?'} />{whys.length > 1 && <Button type="button" size="icon" variant="ghost" aria-label={`Remover por quê ${i + 1}`} onClick={() => setWhys((prev) => prev.filter((_, j) => j !== i))}><Trash2 /></Button>}</div>
            ))}
            <Button type="button" variant="ghost" size="sm" disabled={whys.length >= 7} onClick={() => setWhys((prev) => [...prev, ''])}><Plus />Adicionar nível</Button>
          </fieldset>
          <FieldError message={error} />
          <div className="heading-actions"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Salvar causa'}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ActionSheet({ scope, causes, team, invalidate, onClose }: AnalysisProps & { onClose: () => void }) {
  const create = useServerFn(addAction);
  const [type, setType] = useState<'containment' | 'correction' | 'corrective' | 'preventive'>(scope.problemId ? 'corrective' : 'containment');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (v: Parameters<typeof create>[0]['data']) => create({ data: v }),
    onSuccess: async () => { toast.success('Ação adicionada ao plano.'); await invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });
  const needsCause = type === 'corrective' || type === 'preventive';
  const usable = causes.filter((c) => c.status !== 'discarded');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cost = String(f.get('how_much') ?? '').replace(',', '.');
    const causeId = String(f.get('cause_id') ?? '') || null;
    const ownerId = String(f.get('owner_id') ?? '');
    const dueDate = String(f.get('due_date') ?? '');
    if (!ownerId) { setError('Selecione quem executa a ação.'); return; }
    if (!dueDate) { setError('Informe o prazo.'); return; }
    if (needsCause && !causeId) { setError('Ações corretivas e preventivas precisam indicar a causa tratada.'); return; }
    if (cost && Number.isNaN(Number(cost))) { setError('Informe o custo em reais.'); return; }
    mutation.mutate({ ...scope, type, what: String(f.get('what') ?? ''), why: String(f.get('why') ?? ''), where: String(f.get('where') ?? ''), how: String(f.get('how') ?? ''), howMuch: cost ? Number(cost) : null, ownerId, dueDate, causeId });
  }
  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="sheet-wide">
        <SheetHeader><SheetTitle>Nova ação · 5W2H</SheetTitle><SheetDescription>Contenção e correção liberam a solução quando concluídas; corretivas e preventivas tratam a causa.</SheetDescription></SheetHeader>
        <form className="sheet-form" onSubmit={submit}>
          <label className="field" htmlFor="action-type">Tipo<select id="action-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>{Object.entries(actionLabels).filter(([v]) => !scope.problemId || v === 'corrective' || v === 'preventive').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="field" htmlFor="action-what">O quê<Input id="action-what" name="what" required minLength={3} maxLength={500} /></label>
          <label className="field" htmlFor="action-why">Por quê<Textarea id="action-why" name="why" rows={2} /></label>
          <div className="form-grid">
            <label className="field" htmlFor="action-where">Onde<Input id="action-where" name="where" placeholder="Site, doca, processo" /></label>
            <label className="field" htmlFor="action-owner">Quem<select id="action-owner" name="owner_id" defaultValue=""><option value="">Selecionar responsável</option>{team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
            <label className="field" htmlFor="action-due">Quando<Input id="action-due" name="due_date" type="date" min={todayInSaoPaulo()} required /></label>
            <label className="field" htmlFor="action-cost">Quanto (R$)<Input id="action-cost" name="how_much" inputMode="decimal" placeholder="0,00" /></label>
          </div>
          <label className="field" htmlFor="action-how">Como<Textarea id="action-how" name="how" rows={2} /></label>
          <label className="field" htmlFor="action-cause">Trata a causa<select id="action-cause" name="cause_id" defaultValue=""><option value="">{needsCause ? 'Selecionar causa' : 'Sintoma (sem causa)'}</option>{usable.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.description.slice(0, 80)}</option>)}</select></label>
          {needsCause && !usable.length && <p className="field-hint">Registre uma causa antes de cadastrar ações corretivas ou preventivas.</p>}
          <FieldError message={error} />
          <div className="heading-actions"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Adicionar ação'}</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CompleteActionDialog({ action, scope, invalidate, onClose, allowEvidenceUpload }: AnalysisProps & { action: Action; onClose: () => void }) {
  const complete = useServerFn(completeAction);
  const upload = useServerFn(uploadEvidence);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: async (evidence: string) => {
      if (file && scope.occurrenceId) {
        const f = new FormData();
        f.set('id', scope.occurrenceId);
        f.set('actionId', action.id);
        f.set('file', file);
        await upload({ data: f });
      }
      return complete({ data: { id: action.id, evidence } });
    },
    onSuccess: async () => { toast.success('Ação concluída.'); if (scope.occurrenceId) await qc.invalidateQueries({ queryKey: ['attachments', scope.occurrenceId] }); await invalidate(); onClose(); },
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Concluir ação</DialogTitle><DialogDescription>{action.what}</DialogDescription></DialogHeader>
        <form id="complete-action" onSubmit={(e) => { e.preventDefault(); const evidence = String(new FormData(e.currentTarget).get('evidence') ?? '').trim(); if (evidence.length < 5) { setError('Descreva a evidência da conclusão.'); return; } mutation.mutate(evidence); }}>
          <label className="field" htmlFor="action-evidence">Evidência da conclusão<Textarea id="action-evidence" name="evidence" rows={4} placeholder="O que comprova que a ação foi executada?" /></label>
          {allowEvidenceUpload && scope.occurrenceId && (
            <div className="evidence-picker">
              <input ref={input} type="file" hidden accept={EVIDENCE_ACCEPT} onChange={(e) => { const f = e.target.files?.[0] ?? null; const problem = f ? evidenceProblem(f) : null; setError(problem ?? ''); setFile(problem ? null : f); e.target.value = ''; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><Upload />{file ? file.name : 'Anexar arquivo (opcional)'}</Button>
            </div>
          )}
          <FieldError message={error} />
        </form>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" form="complete-action" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Concluir ação'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
