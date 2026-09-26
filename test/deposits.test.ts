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
async function createMemberWithWallet(username: string) {
  const res = await request(app).post('/members').send({ username });
  return { memberId: res.body.member.id as string, walletId: res.body.wallet.id as string };
}

/**
 * Creates a `Pending` deposit for a member and asserts it was accepted.
 * @param memberId - The depositing member's id.
 * @param amount - The deposit amount, as a decimal string.
 * @param turnoverMultiplier - The turnover multiplier to attach to the deposit.
 * @returns The created deposit's response body.
 */
async function createDeposit(memberId: string, amount = '100.00', turnoverMultiplier = 1) {
  const res = await request(app).post('/deposits').send({ memberId, amount, turnoverMultiplier });
  expect(res.status).toBe(201);
  return res.body as { id: string; pspRef: string; status: string; amount: string };
}

describe('POST /deposits', () => {
  it('creates a pending funding transaction with a pspRef and does not move money', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    const deposit = await createDeposit(memberId, '100.50');

    expect(deposit.status).toBe('pending');
    expect(deposit.pspRef).toBeTruthy();

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('0.000000000000000000');
  });

  it('rejects a non-positive amount', async () => {
    const { memberId } = await createMemberWithWallet('alice02');
    const res = await request(app).post('/deposits').send({ memberId, amount: '0', turnoverMultiplier: 1 });
    expect(res.status).toBe(400);
  });
});

describe('POST /psp/callbacks', () => {
  it('credits the wallet exactly once for a completed callback', async () => {
    const { memberId, walletId } = await createMemberWithWallet('bob01');
    const deposit = await createDeposit(memberId, '100.00');

    const res = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'completed', amount: '100.00' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('completed');

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('100.000000000000000000');
    expect(wallet!.requiredTurnover).toBe('100.000000000000000000');
  });

  it('does not double-credit a duplicate callback delivered sequentially', async () => {
    const { memberId, walletId } = await createMemberWithWallet('bob02');
    const deposit = await createDeposit(memberId, '100.00');

    const first = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'completed', amount: '100.00' });
    const second = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'completed', amount: '100.00' });

    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe('completed');
    expect(second.status).toBe(200);
    expect(second.body.outcome).toBe('already_processed');

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('100.000000000000000000');
  });

  /**
   * Exactly one delivery should apply the credit; the other must observe it
   * already applied, not race it.
   */
  it('does not double-credit two concurrent deliveries of the same callback', async () => {
    const { memberId, walletId } = await createMemberWithWallet('bob03');
    const deposit = await createDeposit(memberId, '100.00');

    const send = () =>
      request(app)
        .post('/psp/callbacks')
        .send({ pspRef: deposit.pspRef, status: 'completed', amount: '100.00' });

    const [a, b] = await Promise.all([send(), send()]);
    const outcomes = [a.body.outcome, b.body.outcome].sort();

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(outcomes).toEqual(['already_processed', 'completed']);

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('100.000000000000000000');
  });

  it('credits the PSP-confirmed amount when it differs from the requested amount', async () => {
    const { memberId, walletId } = await createMemberWithWallet('bob04');
    const deposit = await createDeposit(memberId, '100.00');

    await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'completed', amount: '95.00' });

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('95.000000000000000000');
  });

  it('moves a failed deposit to Failed without touching the wallet', async () => {
    const { memberId, walletId } = await createMemberWithWallet('bob05');
    const deposit = await createDeposit(memberId, '100.00');

    const res = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'failed', amount: '100.00' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('failed');

    const wallet = await Wallet.findByPk(walletId);
    expect(wallet!.balance).toBe('0.000000000000000000');
  });

  it('rejects a callback for an unknown pspRef', async () => {
    const res = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: 'psp_does_not_exist', status: 'completed', amount: '10.00' });
    expect(res.status).toBe(404);
  });

  it('rejects a conflicting status transition on an already-terminal transaction', async () => {
    const { memberId } = await createMemberWithWallet('bob06');
    const deposit = await createDeposit(memberId, '100.00');

    await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'completed', amount: '100.00' });

    const res = await request(app)
      .post('/psp/callbacks')
      .send({ pspRef: deposit.pspRef, status: 'failed', amount: '100.00' });

    expect(res.status).toBe(409);
  });
});
