import { useQuery } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { aevum } from "../chain";
import { REGISTRY, TUSD8, VAULT, payboundVaultAbi, payeeRegistryAbi } from "../contracts";

export interface PayeeRow {
  id: bigint;
  label: string;
  wallet: Address;
  status: number; // 0 None 1 Pending 2 Confirmed 3 Removed
  addedAt: bigint;
  confirmedAt: bigint;
  limit?: {
    perTxCap: bigint;
    periodCap: bigint;
    spentInPeriod: bigint;
    periodLength: bigint;
    periodStart: bigint;
    expiresAt: bigint;
    active: boolean;
  };
  remaining?: bigint;
}

/** All per-creator state in one query (no multicall dependency; parallel eth_calls). */
export function useCreatorState(creator?: Address) {
  const client = usePublicClient({ chainId: aevum.id });
  return useQuery({
    queryKey: ["creator", creator],
    enabled: !!creator && !!client,
    refetchInterval: 15_000,
    queryFn: async () => {
      const c = client!;
      const who = creator!;
      const [wallet, allowance, vaultBal, gas, paused, globalPaused, delay, count] = await Promise.all([
        c.readContract({ address: TUSD8, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
        c.readContract({ address: TUSD8, abi: erc20Abi, functionName: "allowance", args: [who, VAULT] }),
        c.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "balanceOf", args: [who] }),
        c.getBalance({ address: who }),
        c.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "creatorPaused", args: [who] }),
        c.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "globallyPaused" }),
        c.readContract({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "confirmDelayOf", args: [who] }),
        c.readContract({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "payeeCount", args: [who] }),
      ]);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      const payees: PayeeRow[] = await Promise.all(
        ids.map(async (id) => {
          const [p, limit, remaining] = await Promise.all([
            c.readContract({ address: REGISTRY, abi: payeeRegistryAbi, functionName: "getPayee", args: [who, id] }),
            c.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "payeeLimit", args: [who, id] }),
            c.readContract({ address: VAULT, abi: payboundVaultAbi, functionName: "remainingForPayee", args: [who, id] }),
          ]);
          return {
            id,
            label: p.label,
            wallet: p.wallet,
            status: Number(p.status),
            addedAt: BigInt(p.addedAt),
            confirmedAt: BigInt(p.confirmedAt),
            limit: {
              perTxCap: limit.perTxCap,
              periodCap: limit.periodCap,
              spentInPeriod: limit.spentInPeriod,
              periodLength: BigInt(limit.periodLength),
              periodStart: BigInt(limit.periodStart),
              expiresAt: BigInt(limit.expiresAt),
              active: limit.active,
            },
            remaining,
          };
        }),
      );
      return { wallet, allowance, vaultBal, gas, paused, globalPaused, delay: BigInt(delay), payees };
    },
  });
}
export type CreatorState = NonNullable<ReturnType<typeof useCreatorState>["data"]>;
