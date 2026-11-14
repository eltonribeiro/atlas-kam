import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { OccurrenceForm,catalogOptions } from '@/components/atlas/occurrence-form';
export const Route=createFileRoute('/_authenticated/ocorrencias/nova')({head:()=>atlasHead('Nova ocorrência','Registro de reclamação com prazos contratuais Atlas KAM.'),loader:({context})=>context.queryClient.ensureQueryData(catalogOptions),component:OccurrenceForm});
