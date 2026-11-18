export function Brand({ portal = false, tone = 'dark', login = false }: { portal?: boolean; tone?: 'light' | 'dark'; login?: boolean }) {
  return <div className="atlas-brand"><img className={`atlas-logo${login ? ' atlas-logo-login' : ''}`} src={tone === 'dark' ? '/logo-intralog-negativo.png' : '/logo-intralog.png'} width={tone === 'dark' ? 1540 : 1504} height={tone === 'dark' ? 418 : 422} alt="Atlas KAM" /><span className="brand-divider" /><span>{portal ? 'Portal do cliente' : 'Key Account Manager'}</span></div>;
}
