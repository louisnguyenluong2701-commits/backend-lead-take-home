import { Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { Wallet, WalletTx } from '../db/models';
import { WalletTxType } from '../db/models/walletTx';
import { dec, ZERO } from '../lib/money';
import { NotFoundError, UnprocessableError } from '../lib/errors';

/**
 * Row-locks a wallet by id for the lifetime of the caller's transaction. All
 * balance mutations in this service go through a lock acquired here, which is
 * what makes concurrent debits/credits on the same wallet serialize instead of
 * racing.
 * @param walletId - The wallet's id.
 * @param transaction - The transaction to lock the row within.
 * @returns The locked wallet.
 * @throws {NotFoundError} If no wallet exists with that id.
 */
export async function lockWallet(walletId: string, transaction: Transaction): Promise<Wallet> {
  const wallet = await Wallet.findByPk(walletId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!wallet) {
    throw new NotFoundError('wallet not found');
  }
  return wallet;
}

/**
 * Row-locks a wallet by its owning member's id, for the lifetime of the
 * caller's transaction. See {@link lockWallet}.
 * @param memberId - The owning member's id.
 * @param transaction - The transaction to lock the row within.
 * @returns The locked wallet.
 * @throws {NotFoundError} If the member has no wallet.
 */
export async function lockWalletByMemberId(memberId: string, transaction: Transaction): Promise<Wallet> {
  const wallet = await Wallet.findOne({
    where: { memberId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!wallet) {
    throw new NotFoundError('wallet not found for member');
  }
  return wallet;
}

/**
 * Options describing a single ledger entry to append alongside a balance change.
 */
interface LedgerOpts {
  type: WalletTxType;
  fundingTransactionId?: string;
}

/**
 * Credits a wallet and appends the corresponding ledger entry. The caller
 * must already hold the row lock on `wallet` (via {@link lockWallet} or
 * {@link lockWalletByMemberId}) within the same `transaction`.
 * @param wallet - The locked wallet to credit.
 * @param amount - The amount to credit (positive).
 * @param opts - The ledger entry's type and, if applicable, the funding transaction it belongs to.
 * @param transaction - The transaction the caller's row lock was taken within.
 */
export async function creditWallet(
  wallet: Wallet,
  amount: ReturnType<typeof dec>,
  opts: LedgerOpts,
  transaction: Transaction,
): Promise<void> {
  const newBalance = dec(wallet.balance).plus(amount);
  wallet.balance = newBalance.toFixed(18);
  await wallet.save({ transaction });
  await WalletTx.create(
    {
      walletId: wallet.id,
      fundingTransactionId: opts.fundingTransactionId ?? null,
      type: opts.type,
      amount: amount.toFixed(18),
      balanceAfter: wallet.balance,
    },
    { transaction },
  );
}

/**
 * Debits a wallet and appends the corresponding ledger entry. The caller must
 * already hold the row lock on `wallet` (via {@link lockWallet} or
 * {@link lockWalletByMemberId}) within the same `transaction`.
 * @param wallet - The locked wallet to debit.
 * @param amount - The amount to debit (positive).
 * @param opts - The ledger entry's type and, if applicable, the funding transaction it belongs to.
 * @param transaction - The transaction the caller's row lock was taken within.
 * @throws {UnprocessableError} If the wallet's balance is less than `amount`.
 */
export async function debitWallet(
  wallet: Wallet,
  amount: ReturnType<typeof dec>,
  opts: LedgerOpts,
  transaction: Transaction,
): Promise<void> {
  const currentBalance = dec(wallet.balance);
  if (currentBalance.lt(amount)) {
    throw new UnprocessableError('insufficient balance', {
      error: 'insufficient_balance',
      balance: wallet.balance,
      requested: amount.toFixed(18),
    });
  }
  const newBalance = currentBalance.minus(amount);
  wallet.balance = newBalance.toFixed(18);
  await wallet.save({ transaction });
  await WalletTx.create(
    {
      walletId: wallet.id,
      fundingTransactionId: opts.fundingTransactionId ?? null,
      type: opts.type,
      amount: amount.negated().toFixed(18),
      balanceAfter: wallet.balance,
    },
    { transaction },
  );
}

/**
 * Records a wager: debits the wallet and accrues turnover in one locked
 * transaction, so two concurrent wagers on the same wallet cannot both pass
 * the balance check.
 * @param walletId - The wallet placing the wager.
 * @param amountStr - The wager amount, as a positive decimal string.
 * @throws {UnprocessableError} If `amountStr` is not positive, or the wallet's balance is insufficient.
 * @throws {NotFoundError} If no wallet exists with that id.
 */
export async function recordWager(walletId: string, amountStr: string): Promise<void> {
  const amount = dec(amountStr);
  if (amount.lte(ZERO)) {
    throw new UnprocessableError('amount must be positive');
  }

  await sequelize.transaction(async (transaction) => {
    const wallet = await lockWallet(walletId, transaction);
    await debitWallet(wallet, amount, { type: 'wager' }, transaction);
    wallet.accruedTurnover = dec(wallet.accruedTurnover).plus(amount).toFixed(18);
    await wallet.save({ transaction });
  });
}
