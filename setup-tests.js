import '@testing-library/jest-dom';
import {JSDOM} from 'jsdom';
import {NetworkManager} from './packages/core/lib/modules/network-manager';
import {getStorage} from './packages/core/lib/core/storage';
import './packages/transactions/lib/schema';
import {initRealm} from '@docknetwork/wallet-sdk-core/lib/core/realm';
import {mockDockService} from '@docknetwork/wallet-sdk-core/lib/services/test-utils';

initRealm();
NetworkManager.getInstance().setNetworkId('testnet');

mockDockService();

process.env.ENCRYPTION_KEY =
  '776fe87eec8c9ba8417beda00b23cf22f5e134d9644d0a195cd9e0b7373760c1';

const cfg = {url: 'http://localhost'};
const dom = new JSDOM('', cfg);
global.window = dom.window;
global.document = dom.window.document;

Object.keys(global.window).forEach(property => {
  if (typeof global[property] === 'undefined') {
    global[property] = global.window[property];
  }
});

global.navigator = {
  userAgent: 'node.js',
  appVersion: [],
};

require('./packages/core/lib/setup-tests');

jest.mock('@react-native-async-storage/async-storage', () => 'AsyncStorage');

getStorage().setItem('networkId', 'testnet');
