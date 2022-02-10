import {BN_HUNDRED} from '@polkadot/util';
import {DOCK_TOKEN_UNIT} from '../../core/format-utils';
import {dockService} from '../dock/service';
import {walletService} from '../wallet/service';
import {signAndSend} from './api-utils';
import {
  GetAccountBalanceParams,
  serviceName,
  TransactionParams,
  validation,
} from './configs';

export class SubstrateService {
  rpcMethods = [
    SubstrateService.prototype.getAccountBalance,
    SubstrateService.prototype.getFeeAmount,
    SubstrateService.prototype.sendTokens,
  ];

  constructor() {
    this.name = serviceName;
  }

  async getAccountBalance(params: GetAccountBalanceParams) {
    validation.getAccountBalance(params);

    await dockService.ensureDockReady();

    const {
      data: {free},
    } = await dockService.dock.api.query.system.account(params.address);

    return free.toNumber() / DOCK_TOKEN_UNIT;
  }

  async getFeeAmount(params: TransactionParams) {
    validation.getFeeAmount(params);

    const {toAddress, fromAddress, amount} = params;

    const account = await walletService.getAccountKeypair(fromAddress);

    dockService.dock.setAccount(account);

    const extrinsic = dockService.dock.api.tx.balances.transfer(
      toAddress,
      amount,
    );
    const paymentInfo = await extrinsic.paymentInfo(account);
    return paymentInfo.partialFee.toNumber() / DOCK_TOKEN_UNIT;
  }

  async sendTokens(params: TransactionParams) {
    validation.sendTokens(params);

    let {toAddress, fromAddress, amount} = params;
    const account = await walletService.getAccountKeypair(fromAddress);
    const {dock} = dockService;

    dock.setAccount(account);

    if (params.transferAll) {
      const api = dock.api;
      const balances = await api.derive.balances.all(account.address);

      await api.tx.balances
        .transfer(fromAddress, balances.availableBalance)
        .paymentInfo(account)
        .then(async ({partialFee}): void => {
          const adjFee = partialFee.muln(110).div(BN_HUNDRED);
          let maxTransfer = balances.availableBalance.sub(adjFee);

          if (!maxTransfer.gt(api.consts.balances.existentialDeposit)) {
            throw new Error('balance too low');
          }

          amount = maxTransfer;
        });
    }

    return new Promise((resolve, reject) => {
      const extrinsic = dock.api.tx.balances.transfer(toAddress, amount);

      signAndSend(account, extrinsic).on('done', resolve).on('error', reject);
    });
  }
}

export const substrateService: SubstrateService = new SubstrateService();