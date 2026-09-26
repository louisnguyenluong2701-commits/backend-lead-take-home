import { Sequelize } from 'sequelize';
import { config } from '../config';

/**
 * The shared Sequelize connection, used by every model and service in the app.
 */
export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: false,
  define: { underscored: true },
});
