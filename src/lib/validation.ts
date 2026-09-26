import { z } from 'zod';
import { dec, ZERO } from './money';

/**
 * A money amount as it travels the wire: a positive decimal string, never a JS number.
 */
export const positiveDecimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a positive decimal string')
  .refine((v) => dec(v).gt(ZERO), 'must be positive');
