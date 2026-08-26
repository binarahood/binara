'use client';

import type { EthereumProvider } from '@/hooks/useWallet';

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || '';

const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_EXPLORER = 'https://robinhoodchain.blockscout.com';

export function hasWalletConnectProjectId() {
  return Boolean(WALLETCONNECT_PROJECT_ID);
}

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

export async function createWalletConnectProvider(): Promise<EthereumProvider> {
  if (typeof window === 'undefined') throw new Error('WalletConnect is only available in a browser.');
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error('WalletConnect is not configured yet. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in Vercel.');
  }
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const provider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [4663],
    optionalChains: [4663],
    rpcMap: { 4663: ROBINHOOD_RPC },
    showQrModal: true,
    metadata: {
      name: 'Binara',
      description: 'Robinhood Chain liquidity analytics terminal',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });
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
