import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { aevum } from "./chain";

export const config = createConfig({
  chains: [aevum],
  connectors: [injected()],
  transports: { [aevum.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
