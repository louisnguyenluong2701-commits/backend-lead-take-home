'use strict';

module.exports = {
  /**
   * Creates the `members` table.
   * @param queryInterface - The Sequelize query interface.
   * @param Sequelize - The Sequelize library, for its data types.
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('members', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      username: { type: Sequelize.STRING, allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('now()') },
    });
  },

  /**
   * Drops the `members` table.
   * @param queryInterface - The Sequelize query interface.
   */
  async down(queryInterface) {
    await queryInterface.dropTable('members');
  },
};
