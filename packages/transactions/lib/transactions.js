import './schema';
import assert from 'assert';
import {DOCK_TOKEN_UNIT} from '@docknetwork/wallet-sdk-core/lib/core/format-utils';
import BigNumber from 'bignumber.js';
import {Accounts} from '@docknetwork/wallet-sdk-core/lib/modules/accounts';
import {Account} from '@docknetwork/wallet-sdk-core/lib/modules/account';
import {ApiRpc} from '@docknetwork/wallet-sdk-core/lib/client/api-rpc';
import {NetworkManager} from '@docknetwork/wallet-sdk-core/lib/modules/network-manager';
import {getRealm} from '@docknetwork/wallet-sdk-core/lib/core/realm';
import {getRpcEventEmitter} from '@docknetwork/wallet-sdk-core/lib/events';
import {TransactionDetails} from './transaction';
import {fetchTransactions} from '@docknetwork/wallet-sdk-core/lib/core/subscan';

export const TransactionStatus = {
  InProgress: 'pending',
  Failed: 'failed',
  Complete: 'complete',
};

export type TransactionInput = {
  fromAddress?: string,
  toAddress: string,
  amount: string,
};

export class AccountTransactions {
  account: Account;
  transactions: Transactions;

  constructor(account: Account, transactions?: Transactions) {
    assert(!!account, 'account is required');
    assert(
      account instanceof Account,
      'account must be an instance of Account',
    );

    this.account = account;
    this.transactions = transactions || Transactions.getInstance();
  }

  static create(
    account: Account,
    transactions?: Transactions,
  ): AccountTransactions {
    return new AccountTransactions(account, transactions);
  }

  getTxInput({toAddress, amount}) {
    const result = {
      fromAddress: this.account.address,
      toAddress,
      amount,
    };

    return result;
  }

  getFee({toAddress, amount}) {
    return this.transactions.getFeeAmount(
      this.getTxInput({
        toAddress,
        amount,
      }),
    );
  }

  async send({toAddress, amount}) {
    return this.transactions.send(
      this.getTxInput({
        toAddress,
        amount,
      }),
    );
  }

  async getTransactions(): Promise<TransactionDetails[]> {
    return getRealm()
      .objects('Transaction')
      .filtered(
        'fromAddress = $0 or recipientAddress = $0',
        this.account.address,
      )
      .toJSON();
  }
}

export const TransactionEvents = {
  added: 'transaction-added',
  updated: 'transaction-updated',
};

/**
 * Transactions Module
 */
export class Transactions {
  constructor(accounts: Accounts) {
    this.accounts = accounts || Accounts.getInstance();
    this.wallet = this.accounts.wallet;
    this.eventManager = this.wallet.eventManager;
  }

  /**
   * Get transactions module instance
   * @returns module instance
   */
  static getInstance(): Transactions {
    if (!Transactions.instance) {
      Transactions.instance = new Transactions();
    }

    return Transactions.instance;
  }

  static with(account: string | Account): AccountTransactions {
    if (typeof account === 'string') {
      account = Account.with(account);
    }

    return AccountTransactions.create(account);
  }

  getByHash(hash): Promise<TransactionDetails> {
    return getRealm()
      .objects('Transaction')
      .filtered('hash = $0', hash)
      .toJSON()[0];
  }

  getByAccount(address): Promise<TransactionDetails> {
    return getRealm()
      .objects('Transaction')
      .filtered('fromAddress = $0 or recipientAddress = $0', address)
      .toJSON();
  }

  getAll(): Promise<TransactionDetails> {
    return getRealm().objects('Transaction').toJSON();
  }

  /**
   * Load external transactions for the given account
   *
   * @param {string} account
   */
  async loadExternalTransactions(account) {
    assert(typeof account === 'string', 'invalid account address');

    const realm = getRealm();
    const dbTransactions = realm.objects('Transaction');
    const handleTransaction = tx => {
      if (tx.from !== account && tx.to !== account) {
        return;
      }
      if (dbTransactions.find(item => item.hash === tx.hash)) {
        return;
      }
      const newTx = {
        amount: BigNumber(tx.amount).times(DOCK_TOKEN_UNIT).toString(),
        feeAmount: tx.fee,
        recipientAddress: tx.to,
        fromAddress: tx.from,
        id: tx.hash,
        hash: tx.hash,
        network: NetworkManager.getInstance().networkId,
        status: 'complete',
        date: new Date(parseInt(tx.block_timestamp + '000', 10)),
      };
      realm.write(() => {
        realm.create('Transaction', newTx, 'modified');
      });
    };
    let data;
    let page = 0;
    do {
      data = await fetchTransactions({address: account, page});
      data.transfers.forEach(handleTransaction);
      page++;
    } while (data.hasNextPage);
  }

  /**
   * Load transactions for the current accounts
   *
   * @returns transactions
   */
  async loadTransactions() {
    const realm = getRealm();
    const networkId = NetworkManager.getInstance().networkId;
    if (networkId === 'mainnet') {
      const accounts = Accounts.getInstance().getAccounts();
      for (const account of accounts) {
        try {
          this.loadExternalTransactions(account.address);
        } catch (err) {
          console.error(err);
        }
      }
    }

    let items = realm.objects('Transaction');

    if (networkId === 'mainnet') {
      items = items.filter(item => !(item.status === 'complete' && !item.hash));
    }
    return items;
  }

  /**
   * Update transaction
   *
   * @param {*} transaction
   */
  updateTransaction(transaction) {
    const realm = getRealm();

    realm.write(() => {
      realm.create('Transaction', transaction, 'modified');
    });
  }

  /**
   * Get fee amount for the transaction
   * @param {*} param0
   * @returns {int} fee amount
   */
  getFeeAmount({fromAddress, toAddress, amount}) {
    return ApiRpc.getFeeAmount({
      fromAddress: fromAddress,
      toAddress,
      amount,
    });
  }

  /**
   * Send transaction
   * @param {*} param0
   */
  async send({toAddress, fromAddress, amount, fee, prevTxHash}) {
    const amountUnits = parseFloat(amount) * DOCK_TOKEN_UNIT;

    const hash = await ApiRpc.sendTokens({
      toAddress,
      fromAddress,
      amount: amountUnits,
    });

    const realm = getRealm();
    const emitter = getRpcEventEmitter();

    const transaction = {
      hash,
      date: new Date().toISOString(),
      fromAddress: fromAddress,
      recipientAddress: toAddress,
      amount: `${amount}`,
      feeAmount: `${fee}`,
      status: TransactionStatus.InProgress,
      network: NetworkManager.getInstance().networkId,
    };

    realm.write(() => {
      realm.create('Transaction', transaction, 'modified');
    });

    emitter.on(`${hash}-complete`, () => {
      realm.write(() => {
        realm.create(
          'Transaction',
          {
            ...transaction,
            status: TransactionStatus.Complete,
          },
          'modified',
        );
      });
    });

    emitter.on(`${hash}-failed`, error => {
      realm.write(() => {
        realm.create(
          'Transaction',
          {
            ...transaction,
            status: TransactionStatus.Failed,
            error,
          },
          'modified',
        );
      });
    });

    return hash;
  }
}
