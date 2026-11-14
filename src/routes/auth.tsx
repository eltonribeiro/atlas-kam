import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { AuthForm } from '@/components/atlas/auth-form';
export const Route = createFileRoute('/auth')({ head: () => atlasHead('Entrar', 'Acesso interno ao módulo de ocorrências Atlas KAM.'), component: () => <AuthForm /> });
