/**
 * Address-poisoning check: a new address that shares the first and last `edge` hex chars
 * with a known address, but is not identical, is a likely vanity lookalike.
 */
export function findLookalike(candidate: string, known: string[], edge = 4): string | null {
  const c = candidate.toLowerCase().replace(/^0x/, "");
  if (c.length !== 40) return null;
  for (const k of known) {
    const kk = k.toLowerCase().replace(/^0x/, "");
    if (kk === c) continue;
    if (kk.slice(0, edge) === c.slice(0, edge) && kk.slice(-edge) === c.slice(-edge)) return k;
  }
  return null;
}

const KEY = "paybound:counterparties";
export function rememberCounterparty(a: string) {
  const list = recentCounterparties();
  if (!list.some((x) => x.toLowerCase() === a.toLowerCase())) {
    localStorage.setItem(KEY, JSON.stringify([a, ...list].slice(0, 50)));
  }
}
export function recentCounterparties(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
