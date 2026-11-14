import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { OccurrenceDetail,detailOptions } from '@/components/atlas/occurrence-detail';
export const Route=createFileRoute('/_authenticated/ocorrencias/$id')({head:()=>atlasHead('Tratativa da ocorrência','Análise, ações e histórico da ocorrência Atlas KAM.'),loader:({context,params})=>context.queryClient.ensureQueryData(detailOptions(params.id)),component:Detail});
function Detail(){const {id}=Route.useParams();return <OccurrenceDetail id={id}/>;}
