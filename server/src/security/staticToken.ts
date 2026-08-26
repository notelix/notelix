import { createHash } from 'crypto';

export function digestStaticToken(staticToken: string): string {
  return createHash('sha256').update(staticToken, 'utf8').digest('hex');
}
