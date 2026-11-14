import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/ocorrencias/$id')({ head: () => atlasHead('Detalhe da ocorrência', 'Tratativa e acompanhamento no Atlas KAM.'), component: () => <Section title="Detalhe da ocorrência" eyebrow="Tratativa e acompanhamento" detail={true} /> });
