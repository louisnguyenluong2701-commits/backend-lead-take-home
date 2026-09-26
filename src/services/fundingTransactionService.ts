import { sequelize } from '../db/sequelize';
import { FundingTransaction, Member } from '../db/models';
import { dec } from '../lib/money';
import { generatePspRef } from '../lib/pspRef';
import { ConflictError, NotFoundError, UnprocessableError } from '../lib/errors';
import { creditWallet, debitWallet, lockWalletByMemberId } from './walletService';

/**
 * Starts a deposit: creates a `Pending` funding transaction with a fresh
 * `pspRef` for the (mock) PSP to echo back in its callback. No wallet balance
 * changes here.
 * @param params - The deposit request.
 * @param params.memberId - The depositing member's id.
 * @param params.amount - The deposit amount, as a decimal string.
 * @param params.turnoverMultiplier - The turnover multiplier this deposit contributes.
 * @returns The newly created, `Pending` funding transaction.
 * @throws {NotFoundError} If no member exists with that id.
 */
export async function createDeposit(params: {
  memberId: string;
  amount: string;
  turnoverMultiplier: number;
}): Promise<FundingTransaction> {
  const member = await Member.findByPk(params.memberId);
  if (!member) {
    throw new NotFoundError('member not found');
  }

  return FundingTransaction.create({
    memberId: params.memberId,
    type: 'deposit',
    status: 'pending',
    requestedAmount: dec(params.amount).toFixed(18),
    turnoverMultiplier: params.turnoverMultiplier,
    pspRef: generatePspRef(),
  });
}

export type PspCallbackResult = { outcome: 'completed' | 'failed' | 'already_processed' };

/**
 * Handles the (mock) PSP webhook. Exactly-once-credit safe against the same
 * callback being delivered more than once, sequentially or concurrently.
 *
 * Locking strategy: `SELECT ... FOR UPDATE` on the `funding_transactions` row
 * keyed by `psp_ref`, inside a single DB transaction. A concurrent second
 * delivery blocks on that row lock until the first commits, then re-reads
 * `status = 'completed'/'failed'` and no-ops - so idempotency holds even under
 * real concurrency, not just sequential retries.
 *
 * Amount-mismatch policy: the wallet is credited with the PSP-confirmed
 * amount, not the originally requested one - see `DECISIONS.md`.
 * @param params - The callback payload.
 * @param params.pspRef - The reference the deposit was created with.
 * @param params.status - The status the PSP is reporting.
 * @param params.amount - The confirmed amount, as a decimal string.
 * @returns The outcome: whether this call applied the transition, applied nothing (already
 *   processed), or moved the transaction to `failed`.
 * @throws {NotFoundError} If `pspRef` does not match any funding transaction.
 * @throws {ConflictError} If the transaction is already terminal in a conflicting status.
 */
export async function handlePspCallback(params: {
  pspRef: string;
  status: 'completed' | 'failed';
  amount: string;
}): Promise<PspCallbackResult> {
  return sequelize.transaction(async (transaction) => {
    const fundingTx = await FundingTransaction.findOne({
      where: { pspRef: params.pspRef },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!fundingTx) {
      throw new NotFoundError('unknown pspRef');
    }

    if (fundingTx.status !== 'pending') {
      if (fundingTx.status === params.status) {
        return { outcome: 'already_processed' };
      }
      throw new ConflictError(
        `funding transaction already ${fundingTx.status}, cannot transition to ${params.status}`,
      );
    }

    if (params.status === 'failed') {
      fundingTx.status = 'failed';
      await fundingTx.save({ transaction });
      return { outcome: 'failed' };
    }

    const confirmedAmount = dec(params.amount);
    fundingTx.confirmedAmount = confirmedAmount.toFixed(18);
    fundingTx.status = 'completed';
    await fundingTx.save({ transaction });

    const wallet = await lockWalletByMemberId(fundingTx.memberId, transaction);
    await creditWallet(
      wallet,
      confirmedAmount,
      { type: 'deposit', fundingTransactionId: fundingTx.id },
      transaction,
    );

    if (fundingTx.turnoverMultiplier > 0) {
      const requiredDelta = confirmedAmount.times(fundingTx.turnoverMultiplier);
      wallet.requiredTurnover = dec(wallet.requiredTurnover).plus(requiredDelta).toFixed(18);
      await wallet.save({ transaction });
    }

    return { outcome: 'completed' };
  });
}

/**
 * Withdraws from a member's wallet, gated by the turnover lock: the member's
 * accrued turnover must meet or exceed what's required before any withdrawal
 * is allowed. Debits the wallet immediately and creates the funding
 * transaction in `Pending` state (approval is out of scope for this exercise).
 * @param params - The withdrawal request.
 * @param params.memberId - The withdrawing member's id.
 * @param params.amount - The withdrawal amount, as a decimal string.
 * @returns The newly created, `Pending` withdrawal funding transaction.
 * @throws {UnprocessableError} If accrued turnover is below what's required, or the balance is insufficient.
 * @throws {NotFoundError} If the member has no wallet.
 */
export async function createWithdrawal(params: {
  memberId: string;
  amount: string;
}): Promise<FundingTransaction> {
  const amount = dec(params.amount);

  return sequelize.transaction(async (transaction) => {
    const wallet = await lockWalletByMemberId(params.memberId, transaction);

    const required = dec(wallet.requiredTurnover);
    const accrued = dec(wallet.accruedTurnover);
    if (accrued.lt(required)) {
      throw new UnprocessableError('turnover requirement not met', {
        error: 'turnover_locked',
        requiredTurnover: required.toFixed(18),
        accruedTurnover: accrued.toFixed(18),
        outstanding: required.minus(accrued).toFixed(18),
      });
    }

    const fundingTx = await FundingTransaction.create(
      {
        memberId: params.memberId,
        type: 'withdrawal',
        status: 'pending',
        requestedAmount: amount.toFixed(18),
        turnoverMultiplier: 0,
        pspRef: null,
      },
      { transaction },
    );

    await debitWallet(
      wallet,
      amount,
      { type: 'withdrawal', fundingTransactionId: fundingTx.id },
      transaction,
    );

    return fundingTx;
  });
}
