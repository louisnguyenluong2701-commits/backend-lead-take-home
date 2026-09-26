import express, { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { healthRouter } from './routes/health';
import { membersRouter } from './routes/members';
import { depositsRouter } from './routes/deposits';
import { pspCallbacksRouter } from './routes/pspCallbacks';
import { withdrawalsRouter } from './routes/withdrawals';
import { walletsRouter } from './routes/wallets';
import { HttpError } from './lib/errors';

/**
 * Express error-handling middleware. Translates known error types into their
 * HTTP response; anything else is logged and returned as a generic 500.
 * @param err - The error thrown or passed to `next()` by a route handler.
 * @param _req - The incoming request (unused).
 * @param res - The response to write the error to.
 * @param _next - The next middleware in the chain (unused).
 */
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json(err.body ?? { error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
};

/**
 * Builds the Express application: registers all routers and the error handler.
 * @returns A configured Express app, ready to `listen()` or pass to supertest.
 */
export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/members', membersRouter);
  app.use('/deposits', depositsRouter);
  app.use('/psp/callbacks', pspCallbacksRouter);
  app.use('/withdrawals', withdrawalsRouter);
  app.use('/wallets', walletsRouter);

  app.use(errorHandler);
  return app;
}
