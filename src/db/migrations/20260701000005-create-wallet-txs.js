'use strict';

module.exports = {
  /**
   * Creates the `wallet_txs` table: the append-only ledger of balance
   * movements. `amount` is signed (positive = credit, negative = debit); a
   * wallet's balance is always reconstructible as `SUM(amount)` over its rows.
   * @param queryInterface - The Sequelize query interface.
   * @param Sequelize - The Sequelize library, for its data types.
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallet_txs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
      },
      funding_transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'funding_transactions', key: 'id' },
      },
      type: { type: Sequelize.ENUM('deposit', 'withdrawal', 'wager'), allowNull: false },
      amount: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      balance_after: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });

    await queryInterface.addIndex('wallet_txs', ['wallet_id']);
  },

  /**
   * Drops the `wallet_txs` table and its enum type.
   * @param queryInterface - The Sequelize query interface.
   */
  async down(queryInterface) {
    await queryInterface.dropTable('wallet_txs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_wallet_txs_type";');
  },
};
