// Server-only helpers for customer links sent by e-mail. Raw tokens never reach the database.
import { getRequest } from '@tanstack/react-start/server';

export async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
}

export async function newPublicToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token, hash: await sha256Hex(token) };
}

export const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Applies the per-token and per-IP attempt limit before any lookup. */
export async function guardPublicAttempt(hash: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const ip = getRequest().headers.get('cf-connecting-ip') ?? getRequest().headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  for (const key of ['token:' + hash, 'ip:' + (await sha256Hex(ip))]) {
    const r = await supabaseAdmin.rpc('limit_public_link', { p_key: key });
    if (r.error || !r.data) throw new Error('Muitas tentativas. Tente novamente em um minuto.');
  }
  return supabaseAdmin;
}
