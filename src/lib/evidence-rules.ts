export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
export const MAX_EVIDENCE_COUNT = 10;
export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.csv,.xls,.xlsx,.eml,.msg';
export const EVIDENCE_TYPES: Record<string, string[]> = {
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], gif: ['image/gif'],
  pdf: ['application/pdf'], csv: ['text/csv', 'application/vnd.ms-excel'],
  xls: ['application/vnd.ms-excel'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  eml: ['message/rfc822', 'application/octet-stream'], msg: ['application/vnd.ms-outlook', 'application/octet-stream'],
};
export function validateEvidence(name: string, size: number, mime: string) {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (size <= 0 || size > MAX_EVIDENCE_BYTES) throw new Error('Cada arquivo deve ter até 15 MB.');
  if (!EVIDENCE_TYPES[extension]?.includes(mime)) throw new Error('Formato de arquivo não permitido.');
  return name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-180);
}
/** Browser-side check that mirrors the server: returns an error message or null. */
export function evidenceProblem(file: File) {
  try {
    validateEvidence(file.name, file.size, file.type || 'application/octet-stream');
    return null;
  } catch (e) {
    return `${file.name}: ${e instanceof Error ? e.message : 'arquivo inválido'}`;
  }
}
export function formatBytes(bytes?: number | null) {
  if (!bytes) return '0 KB';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
