// Compara as permissões que o SIGA devolve com o papel que o usuário tem hoje no Atlas.
// Só calcula: quem decide (e grava) é a sincronização, conforme SIGA_SYNC_MODE.
import { SIGA_KNOWN_PERMISSIONS, SIGA_PROFILES, type AtlasRole } from './siga-profiles';

export type PermissionEvaluation = {
  /** Perfis do manifesto cujas permissões o usuário tem por completo. */
  matchedProfiles: string[];
  /** Papéis do Atlas correspondentes a esses perfis. */
  matchedRoles: AtlasRole[];
  /** Permissões devolvidas pelo SIGA que não existem no manifesto aprovado. */
  unknownPermissions: string[];
  /** Permissões do perfil do papel atual que o usuário não tem no SIGA. */
  missingForCurrentRole: string[];
  /** O papel atual é um dos papéis que o SIGA concede (ou ambos estão vazios). */
  consistent: boolean;
};

export function evaluatePermissions(permissions: readonly string[], currentRole: AtlasRole | null): PermissionEvaluation {
  const held = new Set(permissions);
  const matched = SIGA_PROFILES.filter(entry => entry.permissions.every(permission => held.has(permission)));
  const matchedRoles = [...new Set(matched.map(entry => entry.role))];
  const current = SIGA_PROFILES.find(entry => entry.role === currentRole);
  return {
    matchedProfiles: matched.map(entry => entry.profile),
    matchedRoles,
    // `siga_*` são permissões do próprio SIGA-PAP (aplicadas por ele na inicialização): não são do Atlas.
    unknownPermissions: [...held].filter(permission => !SIGA_KNOWN_PERMISSIONS.has(permission) && !permission.startsWith('siga_')).sort(),
    missingForCurrentRole: current ? current.permissions.filter(permission => !held.has(permission)) : [],
    consistent: currentRole === null ? matchedRoles.length === 0 : matchedRoles.includes(currentRole),
  };
}
