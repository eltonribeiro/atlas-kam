import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/problemas/')({ head: () => atlasHead('Problemas (RCA)', 'Análise de causa raiz no Atlas KAM.'), component: () => <Section title="Problemas (RCA)" eyebrow="Análise de causa raiz" detail={false} /> });
