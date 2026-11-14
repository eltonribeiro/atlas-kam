import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/contas')({ head: () => atlasHead('Contas', 'Contas-chave no Atlas KAM.'), component: () => <Section title="Contas" eyebrow="Contas-chave" detail={false} /> });
