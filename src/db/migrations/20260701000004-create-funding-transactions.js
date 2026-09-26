'use strict';

module.exports = {
  /**
   * Creates the `funding_transactions` table (one row per deposit/withdrawal
   * request) and its indexes. `psp_ref` gets a partial unique index, since a
   * plain `UNIQUE` constraint's null-handling varies by engine and withdrawals
   * (which have no `psp_ref`) must not collide with each other.
   * @param queryInterface - The Sequelize query interface.
   * @param Sequelize - The Sequelize library, for its data types.
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('funding_transactions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      member_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'members', key: 'id' },
      },
      type: { type: Sequelize.ENUM('deposit', 'withdrawal'), allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      requested_amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      confirmed_amount: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      turnover_multiplier: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      psp_ref: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    await queryInterface.addIndex('funding_transactions', ['member_id']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX funding_transactions_psp_ref_unique ON funding_transactions (psp_ref) WHERE psp_ref IS NOT NULL;',
    );
  },

  /**
   * Drops the `funding_transactions` table and its enum types.
   * @param queryInterface - The Sequelize query interface.
   */
  async down(queryInterface) {
    await queryInterface.dropTable('funding_transactions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_funding_transactions_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_funding_transactions_status";');
  },
};
