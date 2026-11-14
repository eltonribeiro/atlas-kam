import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/ocorrencias/nova')({ head: () => atlasHead('Nova ocorrência', 'Registro de ocorrência no Atlas KAM.'), component: () => <Section title="Nova ocorrência" eyebrow="Registro de ocorrência" detail={false} /> });
