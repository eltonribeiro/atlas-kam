import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadEvidence, getAttachments, uploadEvidence } from '@/lib/attachments.functions';
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_COUNT, evidenceProblem, formatBytes } from '@/lib/evidence-rules';
import { formatDateTime } from './occurrence-ui';

export function Attachments({ id, canUpload, actions = [] }: { id: string; canUpload: boolean; actions?: { id: string; what: string }[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'customer'>('internal');
  const qc = useQueryClient();
  const upload = useServerFn(uploadEvidence);
  const download = useServerFn(downloadEvidence);
  const list = useServerFn(getAttachments);
  const { data = [], isPending, error: loadError, refetch } = useQuery({ queryKey: ['attachments', id], queryFn: () => list({ data: { id } }) });
  const actionNames = Object.fromEntries(actions.map((a) => [a.id, a.what]));

  async function send(files: File[]) {
    setError('');
    const problems = files.map(evidenceProblem).filter((p): p is string => Boolean(p));
    if (problems.length) { setError(problems.join(' ')); return; }
    if (files.length + data.length > MAX_EVIDENCE_COUNT) { setError(`Limite de ${MAX_EVIDENCE_COUNT} anexos por ocorrência.`); return; }
    setBusy(true);
    let sent = 0;
    try {
      for (const file of files) {
        const f = new FormData();
        f.set('id', id);
        f.set('file', file);
        f.set('visibility', visibility);
        await upload({ data: f });
        sent += 1;
      }
      toast.success(sent === 1 ? 'Evidência anexada.' : `${sent} evidências anexadas.`);
    } catch (err) {
      setError(`${sent ? `${sent} arquivo(s) enviado(s). ` : ''}${err instanceof Error ? err.message : 'Falha no envio.'}`);
    } finally {
      setBusy(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ['attachments', id] }), qc.invalidateQueries({ queryKey: ['occurrence', id] })]);
    }
  }

  return (
    <section className="work-section" aria-labelledby="evidence-title">
      <div className="section-title">
        <h2 id="evidence-title"><Paperclip className="inline mr-2" size={18} />Evidências · {data.length}/{MAX_EVIDENCE_COUNT}</h2>
        {canUpload && (
          <div className="heading-actions">
            <select aria-label="Visibilidade das novas evidências" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}><option value="internal">Interna à equipe</option><option value="customer">Pode ser mostrada ao cliente</option></select>
            <Button variant="outline" disabled={busy || data.length >= MAX_EVIDENCE_COUNT} onClick={() => input.current?.click()}><Upload />{busy ? 'Enviando…' : 'Anexar arquivos'}</Button>
          </div>
        )}
      </div>
      <input ref={input} type="file" hidden multiple accept={EVIDENCE_ACCEPT} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void send(files); }} />
      <p className="field-hint">Fotos, PDF, planilhas ou e-mails, até 15 MB cada. O acesso é restrito à equipe da conta; links de download expiram em 10 minutos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loadError ? <p className="form-error" role="alert">Não foi possível carregar os anexos. <Button variant="link" onClick={() => void refetch()}>Tentar novamente</Button></p>
        : isPending ? <p className="text-muted-foreground">Carregando anexos…</p>
        : data.length === 0 ? <p className="text-muted-foreground">Nenhuma evidência anexada.</p>
        : (
          <ul className="file-list">
            {data.map((a) => (
              <li key={a.id}>
                <span className="break-all">
                  {a.filename}
                  <span className="table-secondary">{formatBytes(a.size_bytes)} · {a.visibility === 'customer' ? 'Visível ao cliente' : 'Interno'}{a.action_id ? ` · ação: ${actionNames[a.action_id] ?? 'plano de ação'}` : ''} · {a.uploader_name ?? 'equipe'} · {formatDateTime(a.created_at)}</span>
                </span>
                <Button variant="outline" size="icon" aria-label={`Baixar ${a.filename}`} onClick={async () => { try { window.location.assign(await download({ data: { id: a.id } })); } catch (err) { setError(err instanceof Error ? err.message : 'Anexo indisponível.'); } }}><Download /></Button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
