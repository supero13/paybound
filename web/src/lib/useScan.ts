import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useState } from "react";
import { aevum } from "../chain";
import { TUSD8 } from "../contracts";
import { finalizedBlock, scanVault } from "./logs";

/** Shared vault-log scan (receipts + session grants) and the node's finalized block. */
export function useScan() {
  const client = usePublicClient({ chainId: aevum.id });
  const [progress, setProgress] = useState(0);
  const scan = useQuery({
    queryKey: ["scan"],
    enabled: !!client,
    refetchInterval: 20_000,
    queryFn: () => scanVault(client!, TUSD8, setProgress),
  });
  const fin = useQuery({
    queryKey: ["finalized"],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: () => finalizedBlock(client!),
  });
  return { scan, finalized: fin.data, progress };
}
