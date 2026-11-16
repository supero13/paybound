/**
 * Address-poisoning heuristic: flags an address that shares the same first and last
 * characters as a known payee but is not identical. Attackers generate vanity addresses
 * that match the 4-6 characters wallets usually display.
 */
export function lookalikeOf(candidate: string, known: string[], edge = 4): string | null {
  const c = candidate.toLowerCase().replace(/^0x/, "");
  for (const k of known) {
    const kk = k.toLowerCase().replace(/^0x/, "");
    if (kk === c) continue;
    if (kk.slice(0, edge) === c.slice(0, edge) && kk.slice(-edge) === c.slice(-edge)) return k;
  }
  return null;
}
