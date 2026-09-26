import { Router } from 'express';
import { z } from 'zod';
import * as walletService from '../services/walletService';
import { positiveDecimalString } from '../lib/validation';

export const walletsRouter = Router();

const createWagerBody = z.object({
  amount: positiveDecimalString,
});

const walletIdParam = z.string().uuid();

/**
 * `POST /wallets/:walletId/wagers` - debits the wallet for a wager and accrues
 * turnover; rejects if the wallet has insufficient balance.
 */
walletsRouter.post('/:walletId/wagers', async (req, res, next) => {
  try {
    const walletId = walletIdParam.parse(req.params.walletId);
    const body = createWagerBody.parse(req.body);
    await walletService.recordWager(walletId, body.amount);
    res.status(201).json({ status: 'accepted' });
  } catch (err) {
    next(err);
  }
});
