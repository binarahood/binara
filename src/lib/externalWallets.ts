'use client';

import type { EthereumProvider } from '@/hooks/useWallet';

const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_EXPLORER = 'https://robinhoodchain.blockscout.com';

export async function createCoinbaseWalletProvider(): Promise<EthereumProvider> {
  if (typeof window === 'undefined') throw new Error('Coinbase Wallet is only available in a browser.');
  const { default: CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk');
  const sdk = new CoinbaseWalletSDK({
    appName: 'Binara',
    appChainIds: [4663],
  });
  const provider = sdk.makeWeb3Provider();
  return provider as unknown as EthereumProvider;
}

export async function ensureRobinhoodChain(provider: EthereumProvider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] });
  } catch (error: unknown) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: '0x1237',
        chainName: 'Robinhood Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: [ROBINHOOD_RPC],
        blockExplorerUrls: [ROBINHOOD_EXPLORER],
      }],
    });
  }
}
