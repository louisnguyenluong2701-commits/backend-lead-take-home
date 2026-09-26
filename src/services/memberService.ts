import { sequelize } from '../db/sequelize';
import { Member, Wallet } from '../db/models';

/**
 * Creates a member and its zero-balance wallet in a single transaction.
 * Convention: any operation touching more than one row runs inside a single
 * DB transaction - keep this pattern for everything added to this service.
 * @param username - The member's unique username.
 * @returns The newly created member and wallet.
 */
export async function createMember(username: string): Promise<{ member: Member; wallet: Wallet }> {
  return sequelize.transaction(async (t) => {
    const member = await Member.create({ username }, { transaction: t });
    const wallet = await Wallet.create({ memberId: member.id, balance: '0' }, { transaction: t });
    return { member, wallet };
  });
}

/**
 * Looks up a member's wallet.
 * @param memberId - The owning member's id.
 * @returns The member's wallet, or `null` if none exists.
 */
export async function getWalletByMemberId(memberId: string): Promise<Wallet | null> {
  return Wallet.findOne({ where: { memberId } });
}
