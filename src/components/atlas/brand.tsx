import { Layers3 } from 'lucide-react';
export function Brand({ portal = false }: { portal?: boolean }) {
  return <div className="atlas-brand"><span className="atlas-mark"><Layers3 size={23} aria-hidden="true" /></span><strong>ATLAS</strong><span className="brand-divider" /><span>{portal ? 'Portal do cliente' : 'Key Account Manager'}</span></div>;
}
