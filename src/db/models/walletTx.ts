import { DataTypes, Model, Sequelize } from 'sequelize';

export type WalletTxType = 'deposit' | 'withdrawal' | 'wager';

/**
 * An append-only ledger entry: one row per balance movement on a wallet. A
 * wallet's `balance` is always reconstructible as `SUM(amount)` over its rows.
 * `amount` and `balanceAfter` come back from the pg driver as decimal strings
 * (see `src/lib/money.ts`) and must only ever be read/written through `dec()`.
 * `amount` is signed: positive is a credit, negative is a debit.
 */
export class WalletTx extends Model {
  declare id: string;
  declare walletId: string;
  declare fundingTransactionId: string | null;
  declare type: WalletTxType;
  declare amount: string;
  declare balanceAfter: string;
}

/**
 * Registers the `WalletTx` model on the given Sequelize instance.
 * @param sequelize - The Sequelize connection to attach the model to.
 */
export function initWalletTx(sequelize: Sequelize): void {
  WalletTx.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      walletId: { type: DataTypes.UUID, allowNull: false },
      fundingTransactionId: { type: DataTypes.UUID, allowNull: true },
      type: { type: DataTypes.ENUM('deposit', 'withdrawal', 'wager'), allowNull: false },
      amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
      balanceAfter: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    },
    { sequelize, tableName: 'wallet_txs', underscored: true, updatedAt: false },
  );
}
