import { Router } from 'express';
import { z } from 'zod';
import * as fundingTransactionService from '../services/fundingTransactionService';
import { positiveDecimalString } from '../lib/validation';

export const depositsRouter = Router();

const createDepositBody = z.object({
  memberId: z.string().uuid(),
  amount: positiveDecimalString,
  turnoverMultiplier: z.number().int().min(0).default(1),
});

/**
 * `POST /deposits` - starts a deposit: creates a `Pending` funding transaction
 * and returns a `pspRef` for the (mock) PSP to echo back in its callback. No
 * money moves yet.
 */
depositsRouter.post('/', async (req, res, next) => {
  try {
    const body = createDepositBody.parse(req.body);
    const fundingTx = await fundingTransactionService.createDeposit(body);
    res.status(201).json({
      id: fundingTx.id,
      pspRef: fundingTx.pspRef,
      status: fundingTx.status,
      amount: fundingTx.requestedAmount,
    });
  } catch (err) {
    next(err);
  }
});
