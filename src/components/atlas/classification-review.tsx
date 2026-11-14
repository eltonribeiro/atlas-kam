import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useSuspenseQuery } from '@tanstack/react-query';
import { catalogOptions } from '@/lib/occurrence-queries';
import { reviseClassification } from '@/lib/occurrences.functions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ClassificationReview({ id, impact, urgency, categoryId, onSaved, onCancel }: {
  id: string; impact: 'high'|'medium'|'low'; urgency: 'high'|'medium'|'low'; categoryId: string;
  onSaved: () => Promise<void>; onCancel: () => void;
}) {
  const { data } = useSuspenseQuery(catalogOptions);
  const revise = useServerFn(reviseClassification);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  return <form className="inline-form" onSubmit={async event=>{
    event.preventDefault(); const f=new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      await revise({data:{id,impact:String(f.get('impact')) as typeof impact,urgency:String(f.get('urgency')) as typeof urgency,categoryId:String(f.get('category')),reason:String(f.get('reason'))}});
      await onSaved();
    } catch(e) {setError(e instanceof Error?e.message:'Não foi possível revisar a classificação.');}
    finally {setBusy(false);}
  }}>
    <h3>Revisar severidade e categoria</h3>
    <label className="field">Impacto<select name="impact" defaultValue={impact}><option value="high">Alto</option><option value="medium">Médio</option><option value="low">Baixo</option></select></label>
    <label className="field">Urgência<select name="urgency" defaultValue={urgency}><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
    <label className="field">Categoria<select name="category" defaultValue={categoryId}>{data.categories.filter(c=>!c.parent_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="field">Justificativa<Textarea required name="reason"/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="heading-actions"><Button variant="outline" type="button" onClick={onCancel}>Cancelar</Button><Button disabled={busy}>Salvar revisão</Button></div>
  </form>;
}