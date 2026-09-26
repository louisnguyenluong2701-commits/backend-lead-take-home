import { Router } from 'express';
import { z } from 'zod';
import * as fundingTransactionService from '../services/fundingTransactionService';
import { positiveDecimalString } from '../lib/validation';

export const withdrawalsRouter = Router();

const createWithdrawalBody = z.object({
  memberId: z.string().uuid(),
  amount: positiveDecimalString,
});

/**
 * `POST /withdrawals` - withdraws from a member's wallet if the turnover
 * requirement is met and the balance covers the amount; otherwise rejects with
 * `422` describing the outstanding turnover or the balance shortfall.
 */
withdrawalsRouter.post('/', async (req, res, next) => {
  try {
    const body = createWithdrawalBody.parse(req.body);
    const fundingTx = await fundingTransactionService.createWithdrawal(body);
    res.status(201).json({
      id: fundingTx.id,
      status: fundingTx.status,
      amount: fundingTx.requestedAmount,
    });
  } catch (err) {
    next(err);
  }
});
