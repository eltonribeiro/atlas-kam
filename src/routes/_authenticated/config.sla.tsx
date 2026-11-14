import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { Section } from '@/components/atlas/section';
export const Route = createFileRoute('/_authenticated/config/sla')({ head: () => atlasHead('Contratos e SLA', 'Calendários e prazos contratuais no Atlas KAM.'), component: () => <Section title="Contratos e SLA" eyebrow="Calendários e prazos contratuais" detail={false} /> });
