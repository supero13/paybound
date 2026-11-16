import { createServer } from "node:http";
import { draftFromText } from "./draft.ts";
import type { Payee } from "./types.ts";

/**
 * POST /draft { text, payees }  ->  PaymentDraft
 * Week 1: deterministic drafter. Week 3: LLM proposes structured JSON, then the same
 * guard rails in draft.ts validate it, and the UI calls PayboundVault.previewPayment
 * for the on-chain blockers before asking the creator to sign.
 * TODO(week 3): read confirmed payees from PayeeRegistry server-side instead of trusting the client list.
 */
const PORT = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN ?? "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST" || req.url !== "/draft") {
    res.statusCode = 404;
    return res.end();
  }
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) {
      res.statusCode = 413;
      return res.end();
    }
  }
  try {
    const { text, payees } = JSON.parse(body) as { text: string; payees: Payee[] };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(draftFromText(String(text), payees ?? [])));
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "bad request" }));
  }
}).listen(PORT, () => console.log(`paybound assistant on :${PORT}`));
