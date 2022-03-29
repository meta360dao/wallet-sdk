import {Wallet} from '@docknetwork/wallet-sdk-core/lib/modules/wallet';
import type {WalletDocument} from '@docknetwork/wallet-sdk-core/lib/types';
import {assert} from '@docknetwork/wallet-sdk-core/lib/core/validation';

export type Credential = {
  id: string,
  content: any,
};

export type CredentialInput = {
  content: any,
};

export class Credentials {
  static instance: Credentials;
  wallet: Wallet;

  constructor({wallet} = {}) {
    this.wallet = wallet || Wallet.getInstance();
  }

  /**
   * Add credential to the wallet
   *
   * @param credentialContent
   * @returns {Promise<Credential>}
   */
  async add(credentialContent: any): Promise<Credential> {
    assert(!!credentialContent, 'credentialContent is required');

    const doc = await this.wallet.add({
      value: credentialContent,
      type: 'VerifiableCredential',
    });

    return {
      id: doc.id,
      content: doc.value,
    };
  }

  /**
   * Downloads credential content from url and store in the wallet
   *
   * @param url
   * @returns Promise<Credential>
   */
  addFromUrl(url: string): Promise<Credential> {
    throw new Error('Not implemented');
  }

  /**
   * Removes a credential
   *
   * @param credentialId
   * @returns {Promise<boolean>}
   */
  async remove(credentialId: string): Promise<boolean> {
    assert(!!credentialId, 'credentialId is required');
    return this.wallet.remove(credentialId);
  }

  /**
   * Query credentials
   *
   * @returns {Promise<Credential[]>}
   */
  async query(): Promise<Credential[]> {
    const documents = await this.wallet.query({
      type: 'VerifiableCredential',
    });

    return documents.map((document: WalletDocument) => ({
      content: document.value,
      id: document.id,
    }));
  }

  /**
   * Get instance
   *
   * @returns {Promise<Wallet>}
   */
  static getInstance(): Wallet {
    if (!this.instance) {
      this.instance = new Credentials();
    }

    return this.instance;
  }
}
