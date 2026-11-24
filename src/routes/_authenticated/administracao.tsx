import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { atlasHead } from '@/lib/atlas-head';
import { getSigaPapConfig } from '@/lib/siga-pap-config.functions';
import { isFictitiousEmail } from '@/lib/siga-config';
import { PageHeading } from '@/components/atlas/occurrence-ui';
import { SigaPapFrame } from '@/components/atlas/siga-pap-frame';
import { SigaPermissionsCheck } from '@/components/atlas/siga-permissions-check';

const administrationOptions = queryOptions({
  queryKey: ['siga-administration'],
  queryFn: async () => {
    const config = await getSigaPapConfig();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? '';
    return { config, email: isFictitiousEmail(email) ? '' : email };
  },
});

export const Route = createFileRoute('/_authenticated/administracao')({
  head: () => atlasHead('Administração', 'Administração de permissões do Atlas KAM pelo SIGA.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(administrationOptions),
  component: AdministrationPage,
});

function AdministrationPage() {
  const { data } = useSuspenseQuery(administrationOptions);
  return <main className="atlas-main">
    <PageHeading eyebrow="ADMINISTRAÇÃO" title="Permissões de acesso" subtitle="Atlas KAM · SIGA" />
    {data.config
      ? <><SigaPapFrame config={data.config} email={data.email || data.config.loginHint || undefined} /><SigaPermissionsCheck /></>
      : <div className="data-message"><h2>Administração indisponível</h2><p>A integração não está configurada ou sua conta não possui acesso de administrador.</p></div>}
  </main>;
}