import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { checkMySigaPermissions, type SigaCheckResult } from '@/lib/siga-sync.functions';

const ROLE_LABEL = { analyst: 'Analista', kam: 'KAM', ops_manager: 'Gestor de operações', admin: 'Administrador' } as const;

const MESSAGES: Record<'not-configured' | 'off' | 'no-oid', string> = {
  'not-configured': 'A consulta ao SIGA não está configurada neste ambiente.',
  off: 'A sincronização está desligada.',
  'no-oid': 'Ainda não há o oid do seu usuário no cadastro. Ele é preenchido no login Microsoft.',
};

/** Compara o que o SIGA diz sobre o administrador logado com o papel dele no Atlas. Não grava nada. */
export function SigaPermissionsCheck() {
  const check = useServerFn(checkMySigaPermissions);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SigaCheckResult | null>(null);
  const [failure, setFailure] = useState('');

  async function run() {
    setPending(true); setFailure(''); setResult(null);
    try { setResult(await check()); } catch { setResult(null); setFailure('Não foi possível consultar o SIGA.'); }
    finally { setPending(false); }
  }

  return <section className="work-section siga-check" aria-labelledby="siga-check-title">
    <h2 id="siga-check-title">Verificar minhas permissões no SIGA</h2>
    
    <Button type="button" size="sm" disabled={pending} onClick={() => void run()}>{pending ? 'Consultando…' : 'Verificar agora'}</Button>
    {failure && <p role="alert" className="siga-check-line">{failure}</p>}
    {result && result.status !== 'ok' && result.status !== 'error' && <p className="siga-check-line">{MESSAGES[result.status]}</p>}
    {result?.status === 'error' && <p role="alert" className="siga-check-line">O SIGA não respondeu como esperado (código {result.code}).</p>}
    {result?.status === 'ok' && <dl className="siga-check-result">
      <dt>Modo</dt><dd>{result.mode === 'observe' ? 'Somente comparar (observe)' : 'Somente comparar (enforce; gravação desabilitada)'}</dd>
      <dt>Papel no Atlas</dt><dd>{ROLE_LABEL[result.currentRole]}</dd>
      <dt>Papéis que o SIGA concede</dt><dd>{result.matchedRoles.length ? result.matchedRoles.map(role => ROLE_LABEL[role]).join(', ') : 'nenhum'}</dd>
      <dt>Resultado</dt><dd>{result.consistent ? 'Consistente: o papel atual é concedido pelo SIGA.' : 'Divergente: o SIGA não concede o papel atual por completo.'}</dd>
      <dt>Permissões no SIGA</dt><dd>{result.permissions.length}</dd>
      {result.missingForCurrentRole.length > 0 && <><dt>Faltam para o papel atual</dt><dd>{result.missingForCurrentRole.join(', ')}</dd></>}
      {result.unknownPermissions.length > 0 && <><dt>Fora do manifesto</dt><dd>{result.unknownPermissions.join(', ')}</dd></>}
    </dl>}
  </section>;
}
