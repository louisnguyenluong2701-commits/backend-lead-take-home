import { randomUUID } from 'crypto';

/**
 * Generates an opaque reference to hand to the (mock) PSP; it echoes this
 * value back in the callback so we can look up the pending funding transaction.
 * @returns A new, unique PSP reference string.
 */
export function generatePspRef(): string {
  return `psp_${randomUUID()}`;
}
