import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/problemas/$id')({ head: () => atlasHead('Detalhe do problema', 'Análise e verificação de eficácia no Atlas KAM.'), component: () => <Section title="Detalhe do problema" eyebrow="Análise e verificação de eficácia" detail={true} /> });
