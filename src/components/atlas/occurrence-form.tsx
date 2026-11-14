import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Paperclip, Send, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { occurrenceSchema, previewSla, registerOccurrence } from '@/lib/occurrences.functions';
import { uploadEvidence } from '@/lib/attachments.functions';
import { catalogOptions } from '@/lib/occurrence-queries';
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_COUNT, evidenceProblem, formatBytes } from '@/lib/evidence-rules';
import { FieldError, SeverityBadge, formatTarget, severityNames } from './occurrence-ui';

type Level = 'high' | 'medium' | 'low';
type Errors = Partial<Record<string, string>>;
const fieldOrder: [string, string][] = [
  ['account_id', 'Conta'], ['channel', 'Canal de entrada'], ['contact_id', 'Contato que reportou'], ['occurred_at', 'Quando ocorreu'],
  ['category_id', 'Categoria'], ['subject', 'Assunto'], ['description', 'Relato do cliente'], ['references_text', 'Referências'],
  ['financial_impact', 'Impacto financeiro'], ['customer_expectation', 'Expectativa do cliente'],
];
function jsonRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function OccurrenceForm() {
  const register = useServerFn(registerOccurrence);
  const upload = useServerFn(uploadEvidence);
  const sla = useServerFn(previewSla);
  const { data: catalog } = useSuspenseQuery(catalogOptions);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState(catalog.accounts.length === 1 ? (catalog.accounts[0]?.id ?? '') : '');
  const [category, setCategory] = useState('');
  const [impact, setImpact] = useState<Level>('medium');
  const [urgency, setUrgency] = useState<Level>('medium');
  const [type, setType] = useState<'complaint' | 'incident' | 'request'>('complaint');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useBlocker({ shouldBlockFn: () => dirty && !done && !window.confirm('Descartar o rascunho desta ocorrência?'), enableBeforeUnload: () => dirty && !done });

  const preview = useQuery({ queryKey: ['sla-preview', account, impact, urgency], enabled: Boolean(account), queryFn: () => sla({ data: { accountId: account, impact, urgency } }) });
  const target = jsonRecord(preview.data);

  const mutation = useMutation({
    mutationFn: async (payload: Parameters<typeof register>[0]) => {
      const created = await register(payload);
      const failed: string[] = [];
      for (const file of files) {
        const f = new FormData();
        f.set('id', created.id);
        f.set('file', file);
        f.set('visibility', 'internal');
        try { await upload({ data: f }); } catch (e) { failed.push(`${file.name} (${e instanceof Error ? e.message : 'falha no envio'})`); }
      }
      return { ...created, failed };
    },
    onSuccess: async (r) => {
      setDone(true);
      await qc.invalidateQueries({ queryKey: ['occurrences'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Ocorrência ${r.protocol} registrada.`, { description: 'O cliente receberá a confirmação com o protocolo e o prazo de 1ª resposta.' });
      if (r.failed.length) toast.warning('Alguns arquivos não foram anexados', { description: `${r.failed.join('; ')}. Anexe novamente no detalhe da ocorrência.` });
      await navigate({ to: '/ocorrencias/$id', params: { id: r.id } });
    },
    onError: (e) => setFormError(e.message),
  });

  useEffect(() => { if (Object.keys(errors).length) summaryRef.current?.focus(); }, [errors]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const when = String(f.get('occurred_at') ?? '');
    const amount = String(f.get('financial_impact') ?? '').replace(',', '.');
    const parsed = occurrenceSchema.safeParse({
      account_id: account || undefined, contact_id: String(f.get('contact_id') ?? '') || undefined, channel: f.get('channel') || undefined, type,
      category_id: category || undefined, subcategory_id: String(f.get('subcategory_id') ?? '') || null, subject: String(f.get('subject') ?? ''),
      description: String(f.get('description') ?? ''), customer_expectation: String(f.get('customer_expectation') ?? ''), references_text: String(f.get('references_text') ?? ''),
      financial_impact: amount ? Number(amount) : null, occurred_at: when ? new Date(when).toISOString() : null, impact, urgency,
    });
    setFormError('');
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) { const key = String(issue.path[0] ?? 'form'); next[key] ??= issue.message; }
      setErrors(next);
      return;
    }
    setErrors({});
    mutation.mutate({ data: parsed.data });
  }

  function addFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    const problems = incoming.map(evidenceProblem).filter((p): p is string => Boolean(p));
    const valid = incoming.filter((file) => !evidenceProblem(file));
    const room = MAX_EVIDENCE_COUNT - files.length;
    if (valid.length > room) problems.push(`Limite de ${MAX_EVIDENCE_COUNT} anexos por ocorrência.`);
    setFiles((prev) => [...prev, ...valid.slice(0, Math.max(0, room))]);
    setErrors((prev) => ({ ...prev, files: problems.length ? problems.join(' ') : undefined }));
    setDirty(true);
  }

  const err = (key: string) => ({ 'aria-invalid': errors[key] ? true : undefined, 'aria-describedby': errors[key] ? `${key}-error` : undefined });
  const summary = fieldOrder.filter(([k]) => errors[k]);

  if (!catalog.accounts.length) {
    return <main className="atlas-main"><div className="data-message"><ShieldCheck size={30} /><h2>Nenhuma conta liberada para este usuário</h2><p>Peça ao administrador a definição do seu perfil e a alocação nas contas.</p></div></main>;
  }
  if (catalog.role === 'admin') {
    return <main className="atlas-main"><div className="data-message"><ShieldCheck size={30} /><h2>Perfil de administrador sem registro operacional</h2><p>O registro de ocorrências é feito por analistas, KAMs e gestores alocados nas contas.</p><Button variant="outline" asChild><Link to="/ocorrencias">Voltar para ocorrências</Link></Button></div></main>;
  }

  return (
    <main className="atlas-main">
      <Button variant="link" asChild><Link to="/ocorrencias"><ArrowLeft />Ocorrências</Link></Button>
      <div className="page-heading"><div><p className="eyebrow">REGISTRO DE OCORRÊNCIA</p><h1>Nova ocorrência</h1><p className="page-subtitle">Registre nas palavras do cliente. O protocolo e os prazos são gerados ao salvar.</p></div></div>
      <form onSubmit={submit} onChange={() => setDirty(true)} className="form-layout" noValidate>
        <div>
          {summary.length > 0 && (
            <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
              <strong>Revise {summary.length === 1 ? 'o campo' : `os ${summary.length} campos`} antes de registrar:</strong>
              <ul>{summary.map(([k, label]) => <li key={k}><a href={`#${k}`}>{label}: {errors[k]}</a></li>)}</ul>
            </div>
          )}
          <section className="work-section">
            <h2><span className="section-number">01</span> Quem e por onde</h2>
            <div className="form-grid">
              <label className="field" htmlFor="account_id">Conta<select id="account_id" value={account} onChange={(e) => setAccount(e.target.value)} {...err('account_id')}><option value="">Selecionar conta</option>{catalog.accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select><FieldError id="account_id-error" message={errors['account_id']} /></label>
              <label className="field" htmlFor="channel">Canal de entrada<select id="channel" name="channel" defaultValue="email" {...err('channel')}><option value="email">E-mail</option><option value="phone">Telefone</option><option value="whatsapp">WhatsApp</option><option value="account_meeting">Reunião de conta</option><option value="site_visit">Visita ao site</option><option value="portal">Portal</option></select><FieldError id="channel-error" message={errors['channel']} /></label>
              <label className="field" htmlFor="contact_id">Contato que reportou<select id="contact_id" key={account} name="contact_id" disabled={!account} {...err('contact_id')}><option value="">{account ? 'Selecionar contato cadastrado' : 'Selecione a conta primeiro'}</option>{catalog.contacts.filter((c) => c.account_id === account).map((c) => <option key={c.id} value={c.id}>{c.name}{c.job_title ? ` · ${c.job_title}` : ''}</option>)}</select><FieldError id="contact_id-error" message={errors['contact_id']} /></label>
              <label className="field" htmlFor="occurred_at">Quando o problema ocorreu<Input id="occurred_at" name="occurred_at" type="datetime-local" {...err('occurred_at')} /><FieldError id="occurred_at-error" message={errors['occurred_at']} /></label>
            </div>
          </section>
          <section className="work-section">
            <h2><span className="section-number">02</span> O que aconteceu</h2>
            <div className="type-selector" role="group" aria-label="Tipo de ocorrência">{[{ v: 'complaint', label: 'Reclamação' }, { v: 'incident', label: 'Incidente operacional' }, { v: 'request', label: 'Solicitação' }].map((t) => <Button key={t.v} variant={type === t.v ? 'default' : 'outline'} type="button" aria-pressed={type === t.v} onClick={() => { setType(t.v as typeof type); setDirty(true); }}>{t.label}</Button>)}</div>
            {type === 'request' && <p className="form-notice">Solicitações não entram nos indicadores de reclamação.</p>}
            <div className="form-grid">
              <label className="field" htmlFor="category_id">Categoria<select id="category_id" name="category_id" value={category} onChange={(e) => setCategory(e.target.value)} {...err('category_id')}><option value="">Selecionar categoria</option>{catalog.categories.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><FieldError id="category_id-error" message={errors['category_id']} /></label>
              <label className="field" htmlFor="subcategory_id">Subcategoria<select id="subcategory_id" name="subcategory_id" key={category} disabled={!category || !catalog.categories.some((c) => c.parent_id === category)}><option value="">Sem subcategoria</option>{catalog.categories.filter((c) => c.parent_id === category).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <label className="field" htmlFor="subject">Assunto<Input id="subject" name="subject" maxLength={140} placeholder="Resumo em uma linha" {...err('subject')} /><FieldError id="subject-error" message={errors['subject']} /></label>
            <label className="field" htmlFor="description">Relato do cliente<Textarea id="description" name="description" placeholder="O quê, onde, quando, quanto. Use as palavras do cliente." rows={4} {...err('description')} /><FieldError id="description-error" message={errors['description']} /></label>
            <div className="form-grid">
              <label className="field" htmlFor="references_text">Referências<Input id="references_text" name="references_text" placeholder="Pedido, NF, lote ou endereço" {...err('references_text')} /><FieldError id="references_text-error" message={errors['references_text']} /></label>
              <label className="field" htmlFor="financial_impact">Impacto financeiro estimado (R$)<Input id="financial_impact" name="financial_impact" inputMode="decimal" placeholder="0,00" {...err('financial_impact')} /><FieldError id="financial_impact-error" message={errors['financial_impact']} /></label>
            </div>
            <label className="field expectation-field" htmlFor="customer_expectation">O que o cliente espera como solução<Textarea id="customer_expectation" name="customer_expectation" rows={3} {...err('customer_expectation')} /><FieldError id="customer_expectation-error" message={errors['customer_expectation']} /></label>
            <div className="evidence-picker">
              <div className="section-title"><span className="field-label"><Paperclip size={15} /> Evidências · {files.length}/{MAX_EVIDENCE_COUNT}</span><Button type="button" variant="outline" size="sm" disabled={files.length >= MAX_EVIDENCE_COUNT} onClick={() => fileInput.current?.click()}><Upload />Selecionar arquivos</Button></div>
              <input ref={fileInput} type="file" hidden multiple accept={EVIDENCE_ACCEPT} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <p className="field-hint">Fotos, PDF, planilhas ou e-mails, até 15 MB cada. Ficam internos à equipe.</p>
              <FieldError message={errors['files']} />
              {files.length > 0 && <ul className="file-list">{files.map((file, i) => <li key={`${file.name}-${i}`}><span>{file.name} <span className="text-muted-foreground">· {formatBytes(file.size)}</span></span><Button type="button" variant="ghost" size="icon" aria-label={`Remover ${file.name}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}><Trash2 /></Button></li>)}</ul>}
            </div>
          </section>
          <section className="work-section">
            <h2><span className="section-number">03</span> Severidade</h2>
            <div className="form-grid">
              <label className="field" htmlFor="impact">Impacto na operação<select id="impact" value={impact} onChange={(e) => setImpact(e.target.value as Level)}><option value="high">Alto · para a operação ou o faturamento</option><option value="medium">Médio · afeta parte dos pedidos</option><option value="low">Baixo · sem perda operacional</option></select></label>
              <label className="field" htmlFor="urgency">Urgência<select id="urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Level)}><option value="high">Alta · piora a cada hora</option><option value="medium">Média · solução nesta semana</option><option value="low">Baixa · fluxo normal</option></select></label>
            </div>
            <p className="field-hint">A severidade é calculada pela matriz impacto × urgência e confirmada em até 24 h úteis pelo responsável.</p>
          </section>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="heading-actions form-actions">
            <Button type="button" variant="outline" onClick={() => void navigate({ to: '/ocorrencias' })}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}><Send />{mutation.isPending ? (files.length ? 'Registrando e anexando…' : 'Registrando…') : 'Registrar e notificar cliente'}</Button>
          </div>
        </div>
        <aside className="sla-aside" aria-live="polite">
          <h2><Clock size={18} /> SLA aplicável</h2>
          {!account ? <p>Selecione uma conta para ver os prazos.</p> : preview.isPending ? <p>Calculando…</p> : preview.error ? <p role="alert">{preview.error.message}</p> : (
            <>
              <SeverityBadge severity={String(target['severity'] ?? 'S4')} withName />
              <dl>
                <dt>1ª resposta</dt><dd>{formatTarget(Number(target['first_response_minutes']))}</dd>
                <dt>Solução proposta</dt><dd>{formatTarget(Number(target['resolution_minutes']))}</dd>
                <dt>Atualização ao cliente</dt><dd>a cada {formatTarget(Number(target['update_interval_minutes']))}</dd>
                <dt>Calendário</dt><dd>{String(target['calendar'] ?? '')}</dd>
              </dl>
              <p className="field-hint">{severityNames[String(target['severity'])] ? `Severidade ${severityNames[String(target['severity'])]?.toLowerCase()} pela matriz.` : ''} Prazos contados em horas úteis do contrato.</p>
            </>
          )}
          <div className="aside-rule" />
          <h3>Escalonamento automático</h3>
          <ol><li>50% do prazo · responsável</li><li>80% · KAM da conta</li><li>100% · gestor de operações</li></ol>
        </aside>
      </form>
    </main>
  );
}
