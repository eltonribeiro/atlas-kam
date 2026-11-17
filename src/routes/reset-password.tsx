import { createFileRoute, redirect } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
export const Route = createFileRoute('/reset-password')({ head: () => atlasHead('Acesso Microsoft', 'Acesso ao Atlas KAM pela Microsoft.'), beforeLoad: () => { throw redirect({ to: '/auth', replace: true }); } });
