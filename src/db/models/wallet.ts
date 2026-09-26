import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A member's wallet: the current spendable balance, plus the two turnover
 * counters used to gate withdrawals. `balance`, `requiredTurnover`, and
 * `accruedTurnover` come back from the pg driver as decimal strings (see
 * `src/lib/money.ts`) and must only ever be read/written through `dec()`.
 */
export class Wallet extends Model {
  declare id: string;
  declare memberId: string;
  declare balance: string;
  declare requiredTurnover: string;
  declare accruedTurnover: string;
}

/**
 * Registers the `Wallet` model on the given Sequelize instance.
 * @param sequelize - The Sequelize connection to attach the model to.
 */
export function initWallet(sequelize: Sequelize): void {
  Wallet.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      memberId: { type: DataTypes.UUID, allowNull: false },
      balance: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
      requiredTurnover: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
      accruedTurnover: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
    },
    { sequelize, tableName: 'wallets', underscored: true },
  );
}
