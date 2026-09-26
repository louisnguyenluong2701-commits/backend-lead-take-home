import { DataTypes, Model, Sequelize } from 'sequelize';

export type FundingTransactionType = 'deposit' | 'withdrawal';
export type FundingTransactionStatus = 'pending' | 'completed' | 'failed';

/**
 * A deposit or withdrawal request and its progress through the
 * `Pending -> Completed/Failed` state machine. `requestedAmount` and the
 * other decimal columns come back from the pg driver as strings (see
 * `src/lib/money.ts`) and must only ever be read/written through `dec()`.
 */
export class FundingTransaction extends Model {
  declare id: string;
  declare memberId: string;
  declare type: FundingTransactionType;
  declare status: FundingTransactionStatus;
  declare requestedAmount: string;
  declare confirmedAmount: string | null;
  declare turnoverMultiplier: number;
  declare pspRef: string | null;
}

/**
 * Registers the `FundingTransaction` model on the given Sequelize instance.
 * @param sequelize - The Sequelize connection to attach the model to.
 */
export function initFundingTransaction(sequelize: Sequelize): void {
  FundingTransaction.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      memberId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.ENUM('deposit', 'withdrawal'), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      requestedAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
      confirmedAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
      turnoverMultiplier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      pspRef: { type: DataTypes.STRING, allowNull: true },
    },
    { sequelize, tableName: 'funding_transactions', underscored: true },
  );
}
