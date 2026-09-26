import { Router } from 'express';
import { z } from 'zod';
import * as fundingTransactionService from '../services/fundingTransactionService';

export const pspCallbacksRouter = Router();

const callbackBody = z.object({
  pspRef: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'must be a decimal string'),
});

/**
 * `POST /psp/callbacks` - the (mock) PSP webhook. Idempotent and safe under
 * concurrent duplicate delivery; see `fundingTransactionService.handlePspCallback`.
 */
pspCallbacksRouter.post('/', async (req, res, next) => {
  try {
    const body = callbackBody.parse(req.body);
    const result = await fundingTransactionService.handlePspCallback(body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
