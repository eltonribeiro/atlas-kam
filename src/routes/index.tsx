import { createFileRoute, redirect } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
export const Route = createFileRoute('/')({ head: () => atlasHead('Ocorrências', 'Gestão de ocorrências e atendimento de contas-chave no Atlas KAM.'), beforeLoad: () => { throw redirect({ to: '/ocorrencias' }); } });
