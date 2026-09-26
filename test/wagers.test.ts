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
 * Creates a member, deposits `amount`, and confirms it via the PSP callback,
 * leaving the member with a funded, turnover-tracked wallet.
 * @param username - The new member's username.
 * @param amount - The deposit amount, as a decimal string.
 * @returns The member's id and wallet id.
 */
async function createFundedWallet(username: string, amount = '100.00') {
  const memberRes = await request(app).post('/members').send({ username });
  const memberId = memberRes.body.member.id as string;
  const walletId = memberRes.body.wallet.id as string;

  const deposit = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier: 1 });
  await request(app)
    .post('/psp/callbacks')
    .send({ pspRef: deposit.body.pspRef, status: 'completed', amount });

  return { memberId, walletId };
}

describe('POST /wallets/:walletId/wagers', () => {
  it('debits the wallet and accrues turnover', async () => {
    const { walletId } = await createFundedWallet('carol01');

    const res = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '10.00' });
    expect(res.status).toBe(201);

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('90.000000000000000000');
    expect(wallet!.accruedTurnover).toBe('10.000000000000000000');
  });

  it('rejects a wager that would overdraw the wallet', async () => {
    const { walletId } = await createFundedWallet('carol02');

    const res = await request(app).post(`/wallets/${walletId}/wagers`).send({ amount: '200.00' });
    expect(res.status).toBe(422);

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('100.000000000000000000');
  });

  /**
   * Balance is 100; two concurrent wagers of 60 each must not both succeed.
   */
  it('does not allow concurrent wagers to overdraw a wallet', async () => {
    const { walletId } = await createFundedWallet('carol03', '100.00');

    const wager = (amount: string) => request(app).post(`/wallets/${walletId}/wagers`).send({ amount });

    const [a, b] = await Promise.all([wager('60.00'), wager('60.00')]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([201, 422]);

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('40.000000000000000000');
    expect(wallet!.accruedTurnover).toBe('60.000000000000000000');
  });
});
