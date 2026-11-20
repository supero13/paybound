import { TUSD8_DECIMALS } from "../contracts";

/** Parse a user-typed tUSD8 amount into raw 6-decimal units. Returns null if invalid. Never uses floats. */
export function parseAmount(input: string): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > TUSD8_DECIMALS) return null;
  return BigInt(whole) * 10n ** BigInt(TUSD8_DECIMALS) + BigInt(frac.padEnd(TUSD8_DECIMALS, "0") || "0");
}

export function fmt(v: bigint | undefined | null, max = TUSD8_DECIMALS): string {
  if (v === undefined || v === null) return "–";
  const base = 10n ** BigInt(TUSD8_DECIMALS);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = (a / base).toLocaleString("en-US");
  let frac = (a % base).toString().padStart(TUSD8_DECIMALS, "0").slice(0, max).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const toUnix = (d: string) => BigInt(Math.floor(new Date(d).getTime() / 1000));
export const fromUnix = (t: bigint | number) => new Date(Number(t) * 1000).toLocaleString();
