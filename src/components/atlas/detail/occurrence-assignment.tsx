import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { escalateOccurrence, reassignOccurrence } from '@/lib/occurrences.functions';
import { FieldError, roleLabels } from '../occurrence-ui';
import type { OccurrenceDetailData } from './types';

export function AssignmentActions({ data }: { data: OccurrenceDetailData }) {
  const o = data.occurrence;
  const qc = useQueryClient();
  const reassign = useServerFn(reassignOccurrence);
  const escalate = useServerFn(escalateOccurrence);
  const [open, setOpen] = useState<'' | 'reassign' | 'escalate'>('');
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const close = () => { setOpen(''); setReason(''); setUserId(''); setError(''); };
  const mutation = useMutation({
    mutationFn: () => (open === 'reassign' ? reassign({ data: { id: o.id, userId, reason: reason.trim() } }) : escalate({ data: { id: o.id, reason: reason.trim() } })),
    onSuccess: async () => {
      toast.success(open === 'reassign' ? 'Responsável atualizado.' : 'Ocorrência escalada ao gestor de operações.');
      close();
      await Promise.all([qc.invalidateQueries({ queryKey: ['occurrence', o.id] }), qc.invalidateQueries({ queryKey: ['occurrences'] })]);
    },
    onError: (e) => setError(e.message),
  });
  const eligible = data.team.filter((m) => m.id !== o.assignee_id && m.role !== 'admin');
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen('reassign')}><UserRoundCog />Reatribuir</Button>
      <Button variant="outline" size="sm" onClick={() => setOpen('escalate')}><ArrowUpRight />Escalar</Button>
      <Dialog open={Boolean(open)} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === 'reassign' ? 'Reatribuir ocorrência' : 'Escalar ao gestor de operações'}</DialogTitle>
            <DialogDescription>{open === 'reassign' ? 'O novo responsável é notificado e a troca fica no histórico interno.' : 'Os gestores de operações recebem alerta por e-mail; o KAM é avisado no sistema.'}</DialogDescription>
          </DialogHeader>
          <form id="assignment-form" onSubmit={(e) => {
            e.preventDefault();
            if (open === 'reassign' && !userId) { setError('Selecione o novo responsável.'); return; }
            const min = open === 'reassign' ? 5 : 10;
            if (reason.trim().length < min) { setError(`Descreva o motivo com pelo menos ${min} caracteres.`); return; }
            mutation.mutate();
          }}>
            {open === 'reassign' && (
              <label className="field" htmlFor="assignee-select">Novo responsável<select id="assignee-select" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Selecionar pessoa da conta</option>{eligible.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {roleLabels[m.role] ?? m.role}</option>)}</select></label>
            )}
            {open === 'reassign' && !eligible.length && <p className="field-hint">Nenhuma outra pessoa alocada nesta conta. Peça ao administrador a alocação.</p>}
            <label className="field" htmlFor="assignment-reason">Motivo<Textarea id="assignment-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></label>
            <FieldError message={error} />
          </form>
          <DialogFooter><Button variant="outline" onClick={close}>Cancelar</Button><Button type="submit" form="assignment-form" disabled={mutation.isPending}>{mutation.isPending ? 'Salvando…' : open === 'reassign' ? 'Reatribuir' : 'Escalar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
