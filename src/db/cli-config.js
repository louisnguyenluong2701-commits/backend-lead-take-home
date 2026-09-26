require('dotenv').config();

const url =
  process.env.NODE_ENV === 'test'
    ? process.env.DATABASE_URL_TEST || 'postgres://wallet:wallet@localhost:5439/wallet_test'
    : process.env.DATABASE_URL || 'postgres://wallet:wallet@localhost:5439/wallet';

/**
 * sequelize-cli connection config, keyed by environment (see `npm run db:migrate*`).
 */
module.exports = {
  development: { url, dialect: 'postgres' },
  test: { url, dialect: 'postgres' },
  production: { url, dialect: 'postgres' },
};
