import { createApp } from './app';
import { config } from './config';
import { sequelize } from './db/sequelize';

/**
 * Process entrypoint: verifies the database connection, then starts the HTTP server.
 */
async function main() {
  await sequelize.authenticate();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`mini-wallet-service listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
