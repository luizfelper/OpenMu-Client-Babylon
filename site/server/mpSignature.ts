// Mercado Pago webhook signature verification, kept free of database and network access so it
// can be tested without Bun's SQLite.
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The header Mercado Pago sends:
 *   x-signature: ts=1704908010,v1=618c8533780c...
 *   x-request-id: ...
 * and the signed manifest is `id:<data.id>;request-id:<request-id>;ts:<ts>;`.
 */
export function verifyWebhookSignature(
  header: string | null,
  requestId: string | null,
  dataId: string,
  secret: string
): boolean {
  if (!secret) return true;
  if (!header || !requestId || !dataId) return false;

  const parts = new Map<string, string>();
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    parts.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
