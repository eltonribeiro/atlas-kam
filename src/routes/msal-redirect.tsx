import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';

function MsalRedirect() {
  useEffect(() => {
    void import('@azure/msal-browser/redirect-bridge')
      .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
      .catch(() => undefined);
  }, []);
  return <main aria-busy="true" />;
}

export const Route = createFileRoute('/msal-redirect')({
  head: () => {
    const head = atlasHead('Retorno Microsoft', 'Retorno da autenticação Microsoft para administração do SIGA no Atlas KAM.');
    return { meta: [...head.meta, { name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] };
  },
  component: MsalRedirect,
});