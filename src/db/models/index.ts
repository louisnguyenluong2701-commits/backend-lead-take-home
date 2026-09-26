/**
 * Registers every model on the shared Sequelize connection and wires up their
 * associations. Import this module (not the individual model files) to ensure
 * models are initialized before use.
 */
import { sequelize } from '../sequelize';
import { Member, initMember } from './member';
import { Wallet, initWallet } from './wallet';
import { FundingTransaction, initFundingTransaction } from './fundingTransaction';
import { WalletTx, initWalletTx } from './walletTx';

initMember(sequelize);
initWallet(sequelize);
initFundingTransaction(sequelize);
initWalletTx(sequelize);

Member.hasOne(Wallet, { foreignKey: 'memberId', as: 'wallet' });
Wallet.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });

Member.hasMany(FundingTransaction, { foreignKey: 'memberId', as: 'fundingTransactions' });
FundingTransaction.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });

Wallet.hasMany(WalletTx, { foreignKey: 'walletId', as: 'walletTxs' });
WalletTx.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });

FundingTransaction.hasMany(WalletTx, { foreignKey: 'fundingTransactionId', as: 'walletTxs' });
WalletTx.belongsTo(FundingTransaction, { foreignKey: 'fundingTransactionId', as: 'fundingTransaction' });

export { Member, Wallet, FundingTransaction, WalletTx };
