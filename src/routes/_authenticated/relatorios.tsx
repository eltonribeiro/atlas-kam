import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/relatorios')({ head: () => atlasHead('Relatórios', 'Indicadores de atendimento no Atlas KAM.'), component: () => <Section title="Relatórios" eyebrow="Indicadores de atendimento" detail={false} /> });
