import {TestFixtures} from '../fixtures';
import {NetworkManager} from '../modules/network-manager';
import {Wallet} from '../modules/wallet';
import {dockService} from '../services/dock';
import {mockDockService} from '../services/test-utils';
import promiseMemoize from 'promise-memoize';

export const getTestWallet: Wallet = promiseMemoize(async () => {
  console.log('Start connection');
  await mockDockService();
  const wallet = Wallet.getInstance();

  await wallet.load();
  await wallet.deleteWallet();
  await wallet.accounts.create({
    name: TestFixtures.account1.name,
    mnemonic: TestFixtures.account1.mnemonic,
  });

  await wallet.accounts.create({
    name: TestFixtures.account2.name,
    mnemonic: TestFixtures.account2.mnemonic,
  });

  await wallet.accounts.create({
    name: TestFixtures.noBalanceAccount.name,
    mnemonic: TestFixtures.noBalanceAccount.mnemonic,
  });

  await dockService.init({
    address: NetworkManager.getInstance().getNetworkInfo().substrateUrl,
  });

  return wallet;
});
