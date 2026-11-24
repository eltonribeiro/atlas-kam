import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { AccessDecision } from './siga-access';

/**
 * Quais telas a pessoa logada pode abrir, segundo o SIGA. Devolve só as permissões de tela dela, nunca a lista
 * completa. O oid vem de `profiles.oid` (lido aqui, com service role): o navegador não informa quem é.
 * Qualquer falha vira `denied`: com o SIGA fora do ar nada é liberado.
 */
export const getMyAccess = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessDecision> => {
    const accessServer = await import('./siga-access.server');
    const { getAccessClient, readAccessMode, resolveAccess } = accessServer;
    const mode = readAccessMode(process.env);
    if (mode === 'off') return { status: 'off' };
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const profile = await supabaseAdmin.from('profiles').select('oid').eq('id', context.userId).maybeSingle();
      if (profile.error) return { status: 'denied', reason: 'unavailable' };
      const client = getAccessClient();
      return await resolveAccess({ mode, oid: profile.data?.oid ?? null, client, cache: accessServer.accessCache });
    } catch {
      return { status: 'denied', reason: 'unavailable' };
    }
  });
