# Limits and roadmap (outline)

## Known limits
- Testnet only (Aevum 44005), test tokens only (tUSD8, tQDAY).
- Faucet: 5 tQDAY and 1 tUSD8 per 24h, Cloudflare Turnstile, and a mainnet-balance eligibility check (≥0.0001 ETH or ≥1 USDT/USDC on Ethereum).
- EOA wallets; gas paid in tQDAY. No official QDay SDK on npm yet.
- Payee labels are public on-chain.
- Fixed (not sliding) period windows.
- Not audited.

## Roadmap
- Swap our session `Limit`s for official ERC-4337 session keys when QDay publishes addresses.
- x402 / stablecoin paymaster for gasless payouts.
- ERC-8004 agent identity for the assistant.
- Batch payouts and campaign splits.
- QDay mainnet (wiki: Q1 2027).
