// Acesso por tela a partir das permissões do SIGA (fase 3a). Módulo puro: roda no servidor e no navegador.
// Só protege a INTERFACE (menu e rotas). Os dados continuam protegidos pelo papel (RLS); fechar isso é outra fase.

/**
 * Permissão do SIGA exigida por tela. A rota mais específica vence (`/ocorrencias/nova` antes de `/ocorrencias`).
 * Derive esta tabela do manifesto do app: cada tela usa a permissão `<recurso>_consultar` (ou a ação que a tela exige).
 */
export const SCREEN_PERMISSIONS: readonly { path: string; permission: string }[] = [
  { path: '/ocorrencias/nova', permission: 'atlas-kam.ocorrencias_registrar' },
  { path: '/ocorrencias', permission: 'atlas-kam.ocorrencias_consultar' },
  { path: '/problemas', permission: 'atlas-kam.problemas_consultar' },
  { path: '/contas', permission: 'atlas-kam.contas_consultar' },
  { path: '/config/sla', permission: 'atlas-kam.contratos-sla_consultar' },
  { path: '/relatorios', permission: 'atlas-kam.relatorios_consultar' },
];

/**
 * Telas que não dependem de permissão de tela. A Administração fica de fora de propósito: é o caminho do
 * administrador para corrigir atribuições no SIGA. Ela segue exigindo o papel de administrador no menu.
 */
export const EXEMPT_PATHS: readonly string[] = ['/administracao'];

export type AccessDecision =
  /** Controle desligado (`SIGA_ACCESS_MODE` ausente ou `off`): nada é restringido. */
  | { status: 'off' }
  /** Permissões de tela que o SIGA concede à pessoa (só as que este módulo conhece). */
  | { status: 'ok'; granted: string[] }
  /** Sem como confirmar o acesso: tudo fechado. `no-oid` = pessoa ainda sem oid; `unavailable` = SIGA fora, erro ou mal configurado. */
  | { status: 'denied'; reason: 'no-oid' | 'unavailable' };

const BY_SPECIFICITY = [...SCREEN_PERMISSIONS].sort((a, b) => b.path.length - a.path.length);

function covers(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Permissão da tela, ou `null` quando a rota não está no mapa. */
export function permissionForPath(pathname: string): string | null {
  return BY_SPECIFICITY.find(rule => covers(pathname, rule.path))?.permission ?? null;
}

export function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATHS.some(path => covers(pathname, path));
}

/** Filtra a lista de permissões do SIGA para as que o app usa em telas, sem repetição. */
export function grantedScreenPermissions(permissions: readonly string[]): string[] {
  const known = new Set(SCREEN_PERMISSIONS.map(rule => rule.permission));
  return [...new Set(permissions.filter(permission => known.has(permission)))];
}

/**
 * Decide no navegador se a pessoa pode abrir a rota. Fecha em qualquer dúvida:
 * carregando ou com falha (`decision` indefinido), SIGA fora, sem oid e rota fora do mapa.
 */
export function canOpen(decision: AccessDecision | undefined, pathname: string): boolean {
  if (isExemptPath(pathname)) return true;
  if (!decision) return false;
  if (decision.status === 'off') return true;
  if (decision.status !== 'ok') return false;
  const permission = permissionForPath(pathname);
  return permission !== null && decision.granted.includes(permission);
}
