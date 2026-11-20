import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { aevum } from "./chain";

/** WalletConnect turns on only when a Reown (WalletConnect Cloud) project id is configured. */
export const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;
export const APP_URL = "https://paybound-qday.netlify.app";

const connectors: CreateConnectorFn[] = [injected()];
if (WC_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WC_PROJECT_ID,
      showQrModal: true,
      metadata: { name: "Paybound", description: "Safe tUSD8 payouts on QDay Aevum", url: APP_URL, icons: [`${APP_URL}/favicon.svg`] },
    }),
  );
}

export const config = createConfig({
  chains: [aevum],
  connectors,
  transports: { [aevum.id]: http() },
});

/** Open this dapp inside a mobile wallet's built-in browser (works from Safari/Chrome on a phone). */
const host = APP_URL.replace(/^https:\/\//, "");
export const WALLET_LINKS = [
  { name: "MetaMask", href: `https://metamask.app.link/dapp/${host}` },
  { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(APP_URL)}` },
  { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(APP_URL)}` },
  { name: "OKX Wallet", href: `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(APP_URL)}` },
];

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
