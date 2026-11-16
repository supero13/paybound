# Paybound

**An AI payout assistant for creators on QDay Aevum.** Tell it who to pay in plain English; it drafts the payment. tUSD8 only ever goes to payees you've confirmed, inside on-chain spending limits you can revoke at any time. The assistant drafts, the chain enforces, and you stay in control.

> Built for **QDay Aevum Builder Challenge #1**. Tracks: Native AI Assistants and Confirmation of Payee. **Testnet only. Test tokens only.**

| | |
|---|---|
| Live demo | _TBD (week 2)_ |
| Network | QDay Aevum Testnet, chain ID `44005` (`0xABE5`) |
| RPC / Explorer | `https://rpc-test.qday.info` / https://explorer-test.qday.info |
| Payment token | tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483` (6 decimals) |
| PayeeRegistry | _TBD: not deployed yet_ |
| PayboundVault | _TBD: not deployed yet_ |

## The problem
<!-- TODO: 1 paragraph. Creators pay collaborators by handle, not by raw address; lookalike / poisoned addresses and unlimited approvals cause losses; AI agents that can move money need hard limits. -->

## How it works
1. **Fund a bounded vault:** deposit tUSD8 into `PayboundVault`. You can always withdraw, even while paused.
2. **Confirm payees:** add a payee (label + address) to `PayeeRegistry`, then confirm by re-entering the full address, with an optional cooling-off delay. Unconfirmed payees can't be paid.
3. **Set the leash:** per-payee per-payment cap, period cap (e.g. daily or weekly), and expiry.
4. **Ask, don't auto-send:** "Pay Ada 25 tUSD8 for the November thread" returns a draft that shows the matched payee, amount, remaining cap, and any blockers (via `previewPayment`).
5. **Sign:** you sign `pay()` in your wallet. The receipt event links back to the draft (`ref`) and to the explorer.
6. **Revoke anytime:** revoke a payee limit or an agent session, or pause your vault.

Optional: grant an agent key a **scoped session** with its own per-payment and period caps and an expiry. Payee limits still apply on top, and revoking takes effect immediately.

## Architecture
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
AI draft layer (assistant/)  ──drafts only──▶  Web app (web/)  ──creator-signed txs──▶  PayboundVault ──▶ tUSD8
                                                     │                                       │
                                                     └──────────confirm / look up──────▶ PayeeRegistry
```

## Repo layout
| Path | What |
|---|---|
| `contracts/` | Foundry project: `PayeeRegistry.sol`, `PayboundVault.sol`, tests, deploy script |
| `web/` | Vite + React + wagmi/viem frontend (hard-locked to chain 44005) |
| `assistant/` | Propose-only draft service (no keys); guard rails and prompt-injection tests |
| `scripts/` | Helpers (ABI export) |
| `docs/` | Architecture, demo script, limits and roadmap |

## Quick start
### Prerequisites
- Foundry, Node 22.6+ (Node 24 recommended)
- A wallet on Aevum 44005 with tQDAY for gas and tUSD8 from https://faucet.qday.info

### Contracts
```bash
git clone --recursive <repo> && cd paybound/contracts
forge build
forge test                       # unit + fuzz tests
FORK=1 forge test --match-contract AevumFork   # happy path against the real tUSD8 on an Aevum fork
```

### Deploy (Aevum testnet)
```bash
cp .env.example .env             # fill DEPLOYER_PRIVATE_KEY (a throwaway TESTNET key)
cd contracts && set -a && . ../.env && set +a
forge script script/Deploy.s.sol --rpc-url aevum --broadcast --legacy
```
Verify on the explorer (Blockscout):
```bash
forge verify-contract <REGISTRY> src/PayeeRegistry.sol:PayeeRegistry --chain-id 44005 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/
forge verify-contract <VAULT> src/PayboundVault.sol:PayboundVault --chain-id 44005 \
  --verifier blockscout --verifier-url https://explorer-test.qday.info/api/ \
  --constructor-args $(cast abi-encode "c(address,address,address)" 0x456569838f1d43009A91ebA4263147Afd7233483 <REGISTRY> <GUARDIAN>)
```

### Web
```bash
node scripts/export-abi.mjs
cd web && cp .env.example .env   # set VITE_VAULT_ADDRESS / VITE_REGISTRY_ADDRESS
npm install && npm run dev
```

### Assistant
```bash
cd assistant && npm test && npm start   # POST http://localhost:8787/draft
```

## Safety controls
| Control | Where |
|---|---|
| Propose-only assistant, every payment wallet-signed | `assistant/`, `web/` |
| Confirmed payees only (re-enter address, optional delay) | `PayeeRegistry` |
| Per-payment and period caps, expiry | `PayboundVault.setPayeeLimit` |
| Scoped, expiring, revocable agent sessions | `PayboundVault.grantSession` / `revokeSession` |
| Creator pause and guardian emergency pause (guardian can't move funds) | `PayboundVault` |
| Withdrawals always available | `PayboundVault.withdraw` |
| Lookalike / poisoned address warnings | `assistant/src/lookalike.ts` |
| Prompt-injection guard rails (raw addresses never used as destination) | `assistant/src/draft.ts` |
| On-chain receipts (`PaymentExecuted` with `ref`) | `PayboundVault` |

## Security notes
- Testnet only. No private keys in git: `.env` is gitignored and `.env.example` is blank.
- Payee labels are stored on-chain and are public.
- Not audited.

## Limits and roadmap
See [docs/LIMITS-AND-ROADMAP.md](docs/LIMITS-AND-ROADMAP.md).

## License
MIT
