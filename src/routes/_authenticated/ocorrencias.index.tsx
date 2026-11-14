import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/ocorrencias/')({ head: () => atlasHead('Ocorrências', 'Gestão de reclamações · base ISO 10002 no Atlas KAM.'), component: () => <Section title="Ocorrências" eyebrow="Gestão de reclamações · base ISO 10002" detail={false} /> });
