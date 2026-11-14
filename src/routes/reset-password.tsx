import { createFileRoute } from '@tanstack/react-router';
import { atlasHead } from '@/lib/atlas-head';
import { AuthForm } from '@/components/atlas/auth-form';
export const Route = createFileRoute('/reset-password')({ head: () => atlasHead('Redefinir senha', 'Recuperação de acesso ao Atlas KAM.'), component: () => <AuthForm recovery /> });
