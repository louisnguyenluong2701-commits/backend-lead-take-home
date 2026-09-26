import BigNumber from 'bignumber.js';

/**
 * Money invariants for this codebase: money is stored as `DECIMAL(36,18)` in
 * Postgres and travels as strings in JS/JSON; all arithmetic on money must go
 * through {@link dec}/BigNumber, never JS `number` math.
 */
BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

/**
 * Parses a money value into a {@link BigNumber}, the only type money arithmetic
 * should be done in.
 * @param value - A decimal string, number, or BigNumber to parse.
 * @returns The parsed value as a BigNumber.
 * @throws {Error} If `value` is not a finite number.
 */
export function dec(value: string | number | BigNumber): BigNumber {
  const bn = new BigNumber(value);
  if (!bn.isFinite()) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return bn;
}

/**
 * The BigNumber zero value, for comparisons.
 */
export const ZERO = dec(0);
