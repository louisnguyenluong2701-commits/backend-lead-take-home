import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { Wallet } from '../src/db/models';
import '../src/db/models';

const app = createApp();

beforeAll(async () => {
  await sequelize.authenticate();
});

beforeEach(async () => {
  await sequelize.truncate({ cascade: true });
});

afterAll(async () => {
  await sequelize.close();
});

/**
 * Creates a member and returns its id and wallet id.
 * @param username - The new member's username.
 * @returns The member's id and wallet id.
 */
async function createMember(username: string) {
  const res = await request(app).post('/members').send({ username });
  return { memberId: res.body.member.id as string, walletId: res.body.wallet.id as string };
}

/**
 * Deposits into a member's wallet and confirms it via the PSP callback, so
 * the wallet is funded and its turnover requirement updated.
 * @param memberId - The depositing member's id.
 * @param amount - The deposit amount, as a decimal string.
 * @param turnoverMultiplier - The turnover multiplier to attach to the deposit.
 */
async function deposit(memberId: string, amount: string, turnoverMultiplier: number) {
  const res = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier });
  await request(app).post('/psp/callbacks').send({ pspRef: res.body.pspRef, status: 'completed', amount });
}

describe('POST /withdrawals', () => {
  /**
   * `turnoverMultiplier` 1 on a 100 deposit means 100 required turnover, and
   * nothing has been wagered yet, so nothing is accrued.
   */
  it('blocks a withdrawal when accrued turnover is below what is required', async () => {
    const { memberId } = await createMember('dave01');
    await deposit(memberId, '100.00', 1);

    const res = await request(app).post('/withdrawals').send({ memberId, amount: '50.00' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('turnover_locked');
    expect(res.body.requiredTurnover).toBe('100.000000000000000000');
    expect(res.body.accruedTurnover).toBe('0.000000000000000000');
    expect(res.body.outstanding).toBe('100.000000000000000000');
  });

  /**
   * 100 required turnover (from the first deposit), plus 50 extra balance
   * with no turnover attached, so there's headroom left to withdraw after
   * the turnover requirement is satisfied.
   */
  it('unblocks the withdrawal once accrued turnover meets the requirement', async () => {
    const { memberId, walletId } = await createMember('dave02');
    await deposit(memberId, '100.00', 1);
    await deposit(memberId, '50.00', 0);

    const blocked = await request(app).post('/withdrawals').send({ memberId, amount: '30.00' });
    expect(blocked.status).toBe(422);

    const wagerRes = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '100.00' });
    expect(wagerRes.status).toBe(201);

    const unblocked = await request(app).post('/withdrawals').send({ memberId, amount: '30.00' });
    expect(unblocked.status).toBe(201);
    expect(unblocked.body.status).toBe('pending');

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('20.000000000000000000');
  });

  /**
   * Wagering the full balance satisfies turnover but leaves nothing to withdraw.
   */
  it('rejects a withdrawal that would overdraw even when turnover is satisfied', async () => {
    const { memberId, walletId } = await createMember('dave03');
    await deposit(memberId, '100.00', 1);
    await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '100.00' });

    const res = await request(app).post('/withdrawals').send({ memberId, amount: '10.00' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('insufficient_balance');
  });
});
