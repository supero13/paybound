import { defineChain } from "viem";

/** QDay Aevum Testnet. Hard-coded on purpose: Paybound refuses any other chain. */
export const aevum = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-test.qday.info"], webSocket: ["wss://rpc-test.qday.info"] },
  },
  blockExplorers: {
    default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" },
  },
  testnet: true,
});

export const explorerTx = (hash: string) => `${aevum.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (a: string) => `${aevum.blockExplorers.default.url}/address/${a}`;
