import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

// Scheduled every 5 minutes: persists SLA breaches, alerts, reminders and tacit closures, then sends pending app e-mails.
export const Route = createFileRoute('/api/public/jobs/atlas-tick')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const tick = await supabaseAdmin.rpc('sla_tick');
        if (tick.error) {
          console.error('Atlas SLA tick failed', tick.error.message);
          return Response.json({ ok: false }, { status: 500 });
        }
        const { processDispatches } = await import('@/lib/notifications.server');
        const emails = await processDispatches({ limit: 50, origin: new URL(request.url).origin });
        let siga: { status: string; mode?: string; evaluated?: number; divergent?: number; noOid?: number; errors?: number; writesDisabled?: boolean } = { status: 'error' };
        try {
          const { runScheduledSigaSync } = await import('@/lib/siga-sync.server');
          const result = await runScheduledSigaSync();
          siga = 'evaluated' in result
            ? { status: result.status, mode: result.mode, evaluated: result.evaluated, divergent: result.divergent.length, noOid: result.noOid, errors: result.errors, writesDisabled: result.writesDisabled }
            : { status: result.status };
        } catch {
          console.error('[SIGA] sincronização falhou:', 'unknown');
        }
        return Response.json({ ok: true, emails, siga });
      },
    },
  },
});
