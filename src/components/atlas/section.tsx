import { ClipboardList, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
export function Section({ title, eyebrow = 'Atlas KAM', detail = false }: { title: string; eyebrow?: string; detail?: boolean }) {
  return <main className="atlas-main"><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><span className="stage-label"><ShieldCheck size={15} /> Base inicial</span></div><div className="section-rule" /><div className="empty-section"><span className="empty-icon"><ClipboardList size={30} strokeWidth={1.5} /></span><h2>{detail ? 'Registro indisponível' : 'Nenhum registro disponível'}</h2><p>{detail ? 'Este registro ainda não está disponível.' : 'Os registros aparecerão aqui quando esta etapa estiver disponível.'}</p><Button variant="outline" asChild><Link to="/ocorrencias">Voltar para ocorrências <ArrowRight /></Link></Button></div><footer className="section-footer"><span>ATLAS · Gestão de contas-chave</span><span>America/Sao_Paulo</span></footer></main>;
}
