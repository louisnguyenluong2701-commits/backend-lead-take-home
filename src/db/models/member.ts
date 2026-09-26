import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A registered player. Owns exactly one {@link import('./wallet').Wallet}.
 */
export class Member extends Model {
  declare id: string;
  declare username: string;
}

/**
 * Registers the `Member` model on the given Sequelize instance.
 * @param sequelize - The Sequelize connection to attach the model to.
 */
export function initMember(sequelize: Sequelize): void {
  Member.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      username: { type: DataTypes.STRING, allowNull: false, unique: true },
    },
    { sequelize, tableName: 'members', underscored: true },
  );
}
