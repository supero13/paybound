/** Address-poisoning heuristic: same first/last `edge` hex chars as a known address, but different. */
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
