'use strict';

module.exports = {
  /**
   * Creates the `wallets` table, one row per member.
   * @param queryInterface - The Sequelize query interface.
   * @param Sequelize - The Sequelize library, for its data types.
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallets', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      member_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'members', key: 'id' },
        unique: true,
      },
      balance: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: '0' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });
  },

  /**
   * Drops the `wallets` table.
   * @param queryInterface - The Sequelize query interface.
   */
  async down(queryInterface) {
    await queryInterface.dropTable('wallets');
  },
};
