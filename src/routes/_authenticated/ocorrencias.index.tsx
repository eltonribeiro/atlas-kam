import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { OccurrenceList,occurrencesOptions } from '@/components/atlas/occurrence-list';
export const Route=createFileRoute('/_authenticated/ocorrencias/')({head:()=>atlasHead('Ocorrências','Gestão de reclamações e prazos do Atlas KAM.'),loader:({context})=>context.queryClient.ensureQueryData(occurrencesOptions),component:OccurrenceList});
