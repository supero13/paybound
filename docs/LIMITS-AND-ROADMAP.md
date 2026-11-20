# Limits and roadmap

## Known limits
- Testnet only (Aevum 44005), test tokens only (tUSD8, tQDAY).
- Faucet: 5 tQDAY and 1 tUSD8 per 24h, Cloudflare Turnstile, and a mainnet-balance eligibility check (≥0.0001 ETH or ≥1 USDT/USDC on Ethereum).
- EOA wallets; gas paid in tQDAY. No official QDay SDK on npm yet.
- Payee labels are public on-chain.
- Fixed (not sliding) period windows.
- Not audited.
- Blockscout source verification fails on QDay's side (`Fail - Unable to verify`; the verifier lists no compiler versions). The bytecode matches a local build; re-verify once it's fixed.
- WalletConnect is optional and off until `VITE_WC_PROJECT_ID` is set. Phones use wallet in-app browsers or deep links.
- The demo video's approval is a scripted signature (`cast`), not a live wallet tap.
- The contract doesn't reject a reused `ref`. Double-pay protection is in the app, and caps bound the worst case.

## Roadmap
- Swap our session `Limit`s for official ERC-4337 session keys when QDay publishes addresses.
- x402 / stablecoin paymaster for gasless payouts.
- ERC-8004 agent identity for the assistant.
- Batch payouts and campaign splits.
- QDay mainnet (wiki: Q1 2027).
