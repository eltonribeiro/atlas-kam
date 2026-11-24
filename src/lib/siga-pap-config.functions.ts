import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { readSigaPapConfig, type SigaPapConfig } from './siga-config';

/**
 * Entrega ao navegador a configuração pública do SIGA-PAP, lida das Secrets do servidor.
 * Só devolve os campos públicos (URL do plugin, escopo, clientId, tenantId, rota de retorno).
 * Nenhum segredo sai daqui: a chave da API e o client_secret ficam em siga-api.server.ts.
 */
export const getSigaPapConfig = createServerFn()
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SigaPapConfig | null> => {
    const role = await context.supabase.rpc('current_app_role');
    if (role.error || role.data !== 'admin') return null;
    return readSigaPapConfig(process.env);
  });
