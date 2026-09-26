'use strict';

module.exports = {
  /**
   * Adds the `required_turnover` and `accrued_turnover` counters to `wallets`,
   * used to gate withdrawals behind the turnover requirement.
   * @param queryInterface - The Sequelize query interface.
   * @param Sequelize - The Sequelize library, for its data types.
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('wallets', 'required_turnover', {
      type: Sequelize.DECIMAL(36, 18),
      allowNull: false,
      defaultValue: '0',
    });
    await queryInterface.addColumn('wallets', 'accrued_turnover', {
      type: Sequelize.DECIMAL(36, 18),
      allowNull: false,
      defaultValue: '0',
    });
  },

  /**
   * Removes the `required_turnover` and `accrued_turnover` columns from `wallets`.
   * @param queryInterface - The Sequelize query interface.
   */
  async down(queryInterface) {
    await queryInterface.removeColumn('wallets', 'required_turnover');
    await queryInterface.removeColumn('wallets', 'accrued_turnover');
  },
};
