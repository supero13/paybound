import { erc20Abi, formatUnits } from "viem";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { aevum, explorerAddress } from "./chain";
import { REGISTRY, TUSD8, TUSD8_DECIMALS, VAULT, payboundVaultAbi } from "./contracts";

// Week-1 scaffold: wallet connect, hard network guard, balances.
// Week 2 adds deposit, payee book, limits, manual payout and receipts.
export default function App() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== aevum.id;

  const wallet = useReadContract({
    address: TUSD8,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !wrongChain },
  });
  const vaultBal = useReadContract({
    address: VAULT,
    abi: payboundVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!VAULT && !wrongChain },
  });

  const fmt = (v?: bigint) => (v === undefined ? "–" : formatUnits(v, TUSD8_DECIMALS));

  return (
    <main className="wrap">
      <header>
        <h1>Paybound</h1>
        <p className="tag">The assistant drafts. The chain enforces. You stay in control.</p>
      </header>

      {!isConnected ? (
        <button disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
          Connect wallet
        </button>
      ) : wrongChain ? (
        <div className="warn">
          <p>Wrong network. Paybound only works on QDay Aevum Testnet (chain 44005).</p>
          <button onClick={() => switchChain({ chainId: aevum.id })}>Switch to Aevum</button>
        </div>
      ) : (
        <section className="card">
          <p>
            Connected: <a href={explorerAddress(address!)} target="_blank" rel="noreferrer">{address}</a>
          </p>
          <p>Wallet tUSD8: {fmt(wallet.data)}</p>
          <p>Vault tUSD8: {VAULT ? fmt(vaultBal.data) : "vault not deployed yet"}</p>
          <button onClick={() => disconnect()}>Disconnect</button>
        </section>
      )}

      <footer>
        <small>
          Testnet only · tUSD8 {TUSD8} · Vault {VAULT ?? "TBD"} · Registry {REGISTRY ?? "TBD"}
        </small>
      </footer>
    </main>
  );
}
