import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { aevum, explorerAddress } from "./chain";
import { REGISTRY, TUSD8, VAULT } from "./contracts";
import { useCreatorState } from "./lib/data";
import { useScan } from "./lib/useScan";
import { short } from "./lib/units";
import { VaultPanel } from "./components/VaultPanel";
import { PayeesPanel } from "./components/PayeesPanel";
import { LimitsPanel } from "./components/LimitsPanel";
import { PayPanel } from "./components/PayPanel";
import { ReceiptsPanel } from "./components/ReceiptsPanel";
import { AskPanel } from "./components/AskPanel";
import { WALLET_LINKS } from "./wagmi";

const TABS = [
  { id: "ask", icon: "🤖", label: "Ask" },
  { id: "pay", icon: "⚡", label: "Pay" },
  { id: "payees", icon: "👥", label: "Payees" },
  { id: "limits", icon: "🛡️", label: "Limits" },
  { id: "vault", icon: "🏦", label: "Vault" },
  { id: "receipts", icon: "🧾", label: "Receipts" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== aevum.id;
  const hasInjected = typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum;
  const me = !wrongChain ? address : undefined;
  const st = useCreatorState(me);
  const { scan, finalized, progress } = useScan();
  const [tab, setTab] = useState<Tab>(isConnected ? "ask" : "receipts");
  const receipts = scan.data?.receipts ?? [];

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Paybound</h1>
          <p className="tag">The assistant drafts. The chain enforces. You stay in control.</p>
        </div>
        {isConnected && (
          <button className="pill" onClick={() => disconnect()} title="Disconnect">
            <span className="dot" /> {short(address)}
          </button>
        )}
      </header>

      <main className="wrap">
        {!isConnected ? (
          <section className="card hero">
            <h2>Pay creators safely in tUSD8</h2>
            <ul className="bullets">
              <li>✅ Only <b>confirmed payees</b>, so a poisoned address can't get paid</li>
              <li>🛡️ <b>On-chain caps</b> per payment and per period, with expiry</li>
              <li>⏸ <b>Pause or revoke</b> any time; withdrawals always work</li>
              <li>🧾 <b>Receipts</b> for every payout, linked on the explorer</li>
            </ul>
            {hasInjected &&
              connectors
                .filter((c) => c.type === "injected")
                .slice(0, 1)
                .map((c) => (
                  <button key={c.uid} className="big" disabled={isPending} onClick={() => connect({ connector: c })}>
                    Connect wallet
                  </button>
                ))}
            {connectors
              .filter((c) => c.type === "walletConnect")
              .map((c) => (
                <button key={c.uid} className={hasInjected ? "big ghost" : "big"} disabled={isPending} onClick={() => connect({ connector: c })}>
                  WalletConnect (scan or pick a wallet)
                </button>
              ))}
            {!hasInjected && (
              <div className="wallets">
                <p className="muted small">No wallet found in this browser. Open Paybound in your wallet app:</p>
                {WALLET_LINKS.map((w) => (
                  <a key={w.name} className="walletlink" href={w.href}>
                    Open in {w.name} →
                  </a>
                ))}
              </div>
            )}
            {error && <p className="status error">{error.message.split("\n")[0]}</p>}
            <p className="muted small">QDay Aevum Testnet · chain 44005 · test tokens only.</p>
          </section>
        ) : wrongChain ? (
          <section className="card danger">
            <h2>Wrong network</h2>
            <p>Paybound only works on QDay Aevum Testnet (chain 44005).</p>
            <button onClick={() => switchChain({ chainId: aevum.id })}>Switch to Aevum</button>
          </section>
        ) : !st.data ? (
          <p className="muted">{st.error ? `Couldn't read the chain: ${st.error.message}` : "Loading your vault…"}</p>
        ) : (
          <>
            {tab === "ask" && <AskPanel st={st.data} me={me!} />}
            {tab === "pay" && <PayPanel st={st.data} me={me!} />}
            {tab === "payees" && <PayeesPanel st={st.data} me={me!} receipts={receipts} />}
            {tab === "limits" && <LimitsPanel st={st.data} me={me!} agents={scan.data?.agents ?? []} />}
            {tab === "vault" && <VaultPanel st={st.data} me={me!} />}
          </>
        )}
        {(tab === "receipts" || !isConnected) && (
          <ReceiptsPanel receipts={receipts} finalized={finalized} loading={scan.isFetching && !scan.data} progress={progress} me={me} st={st.data} />
        )}

        <footer>
          <small>
            Testnet only · <a href={explorerAddress(VAULT)} target="_blank" rel="noreferrer">Vault {short(VAULT)}</a> ·{" "}
            <a href={explorerAddress(REGISTRY)} target="_blank" rel="noreferrer">Registry {short(REGISTRY)}</a> ·{" "}
            <a href={explorerAddress(TUSD8)} target="_blank" rel="noreferrer">tUSD8 {short(TUSD8)}</a>
          </small>
        </footer>
      </main>

      {isConnected && !wrongChain && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
