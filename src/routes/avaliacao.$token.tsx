import { createFileRoute } from '@tanstack/react-router';
import { Link2Off } from 'lucide-react';
import { atlasHead } from '@/lib/atlas-head';
import { Brand } from '@/components/atlas/brand';
export const Route = createFileRoute('/avaliacao/$token')({ head: () => atlasHead('Avaliação do cliente', 'Avaliação do atendimento da sua ocorrência no Atlas KAM.'), component: () => <div className="auth-page"><header className="auth-header"><Brand portal /></header><main className="evaluation-main"><Link2Off size={32} /><h1>Avaliação indisponível</h1><p>Não foi possível validar este link de avaliação.</p></main></div> });
