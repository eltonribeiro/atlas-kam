import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { getContestations,reviewContestation } from '@/lib/occurrences.functions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ContestationReview({id}:{id:string}) {
 const {data}=useSuspenseQuery(queryOptions({queryKey:['contestations',id],queryFn:()=>getContestations({data:{id}})}));
 const review=useServerFn(reviewContestation);const qc=useQueryClient();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 if(!data.rows.length)return null;
 return <section className="work-section"><h2>Contestação de improcedência</h2>{error&&<p role="alert" className="form-error">{error}</p>}{data.rows.map(c=><article key={c.id}><p>{c.body}</p>{c.reviewed_at?<p>{c.decision==='reopen'?'Reabertura aprovada':'Improcedência mantida'} · {c.reason}</p>:data.canReview?<form className="inline-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);try{await review({data:{id:c.id,decision:String(f.get('decision')) as 'uphold'|'reopen',reason:String(f.get('reason'))}});await qc.invalidateQueries({queryKey:['contestations',id]});await qc.invalidateQueries({queryKey:['occurrence',id]});}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir a revisão.');}finally{setBusy(false);}}}><label className="field">Decisão<select name="decision" aria-label="Decisão"><option value="uphold">Manter improcedência</option><option value="reopen">Reabrir com novo ciclo de SLA</option></select></label><label className="field">Justificativa da revisão<Textarea name="reason" required/></label><Button disabled={busy}>Concluir revisão</Button></form>:<p>Revisão pendente do KAM ou gestor.</p>}</article>)}</section>;
}