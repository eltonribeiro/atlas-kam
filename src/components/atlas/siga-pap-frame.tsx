import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SigaPapConfig } from '@/lib/siga-config';
import { createSigaTokenProvider, SigaInteractionRequired, type SigaTokenProvider } from '@/lib/siga-msal';
import { parsePluginMessage, serializeSessionContext } from '@/lib/siga-session';

type Status = 'waiting' | 'connecting' | 'needs-login' | 'connected' | 'error';

/**
 * Hospeda o SIGA-PAP em um iframe e responde ao handshake por postMessage.
 * Só mensagens que vêm do próprio iframe e da origem exata do plugin são atendidas, e o
 * session-context só é enviado a essa mesma origem (nunca "*").
 */
export function SigaPapFrame({ config, email, provider }: { config: SigaPapConfig; email?: string | undefined; provider?: SigaTokenProvider | undefined }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const tokens = useMemo(() => provider ?? createSigaTokenProvider(config), [provider, config]);
  const [status, setStatus] = useState<Status>('waiting');
  const [account, setAccount] = useState('');

  const deliver = useCallback(async (interactive: boolean) => {
    const target = frameRef.current?.contentWindow;
    if (!target || pending.current) return;
    const current = generation.current;
    pending.current = true;
    setStatus('connecting');
    try {
      const token = await tokens.getToken({ interactive, loginHint: email });
      if (current !== generation.current || target !== frameRef.current?.contentWindow) return;
      target.postMessage(serializeSessionContext({
        tenantId: token.tenantId,
        userId: token.userId,
        locale: navigator.language || 'pt-BR',
        clientId: config.clientId,
        accessToken: token.accessToken,
      }), config.pluginOrigin);
      setAccount(token.username);
      setStatus('connected');
    } catch (error) {
      if (current !== generation.current) return;
      // Do not log Microsoft error messages: they can include personal identifiers.
      setStatus(error instanceof SigaInteractionRequired ? 'needs-login' : 'error');
    } finally { pending.current = false; }
  }, [tokens, email, config.clientId, config.pluginOrigin]);

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus(previous => previous === 'waiting' ? 'error' : previous), 15000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== config.pluginOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!parsePluginMessage(event.data)) return;
      void deliver(false);
    }
    window.addEventListener('message', onMessage);
    return () => { generation.current += 1; window.clearTimeout(timer); window.removeEventListener('message', onMessage); };
  }, [config.pluginOrigin, deliver]);

  return <div className="siga-pap">
    <div className="siga-pap-status" role="status" aria-live="polite">
      {status === 'waiting' && <><Loader2 className="animate-spin" size={14} /> Aguardando o SIGA…</>}
      {status === 'connecting' && <><Loader2 className="animate-spin" size={14} /> Conectando ao SIGA…</>}
      {status === 'connected' && <><ShieldCheck size={14} /> Conectado como {account}</>}
      {status === 'needs-login' && <>
        <span>Para administrar permissões, entre com a sua conta Microsoft.</span>
        <Button type="button" size="sm" onClick={() => void deliver(true)}>Conectar ao SIGA</Button>
      </>}
      {status === 'error' && <>
        <span role="alert">Não foi possível conectar ao SIGA. Tente novamente.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void deliver(true)}>Tentar novamente</Button>
      </>}
    </div>
    <iframe ref={frameRef} src={config.pluginUrl} title="siga-pap" sandbox="allow-scripts allow-same-origin allow-forms" className="siga-pap-frame" />
  </div>;
}
