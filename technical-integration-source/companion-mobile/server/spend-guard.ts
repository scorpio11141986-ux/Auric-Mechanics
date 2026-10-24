import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export type SpendPolicy = {
  accountDailyUsd: number;
  globalDailyUsd: number;
  perRequestUsd: number;
  prices: { input: number; cached: number; output: number };
  ledgerPath?: string;
  memoryOnly?: boolean;
};
type Ledger = { schema: "SpendLedgerV1"; totals: Record<string, number>; attempts: Record<string, { hash: string; reserved: number; day: string }> };
export class SpendError extends Error {
  constructor(message: string, public status = 429) { super(message); }
}
const micro = (usd: number) => Math.ceil(usd * 1e6);

export function createSpendGuard(policy: SpendPolicy) {
  if ([policy.accountDailyUsd, policy.globalDailyUsd, policy.perRequestUsd, ...Object.values(policy.prices)].some((n) => !Number.isFinite(n) || n < 0) ||
    !policy.perRequestUsd || !policy.accountDailyUsd || !policy.globalDailyUsd ||
    (!policy.memoryOnly && !policy.ledgerPath)) throw Error("A durable ledger, positive budget ceilings and explicit nonnegative pricing are required");
  let ledger: Ledger = { schema: "SpendLedgerV1", totals: {}, attempts: {} };
  let lock: number | undefined;
  if (policy.ledgerPath) {
    mkdirSync(dirname(policy.ledgerPath), { recursive: true });
    lock = openSync(`${policy.ledgerPath}.lock`, "wx");
    try {
      if (existsSync(policy.ledgerPath)) {
        ledger = JSON.parse(readFileSync(policy.ledgerPath, "utf8"));
        if (ledger.schema !== "SpendLedgerV1" || !ledger.totals || !ledger.attempts ||
          Object.values(ledger.totals).some((v) => !Number.isSafeInteger(v) || v < 0) ||
          Object.values(ledger.attempts).some((v) => !v || typeof v.hash !== "string" || !Number.isSafeInteger(v.reserved) || v.reserved < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)))
          throw Error("Invalid spend ledger; refuse inference until inspected");
      }
    } catch (error) { closeSync(lock); unlinkSync(`${policy.ledgerPath}.lock`); throw error; }
  }
  const persist = () => {
    if (!policy.ledgerPath) return;
    const temporary = `${policy.ledgerPath}.next`;
    writeFileSync(temporary, JSON.stringify(ledger), { mode: 0o600 });
    renameSync(temporary, policy.ledgerPath);
  };
  return {
    reserve(accountId: string, requestId: string, payloadHash: string, contextBytes: number) {
      const day = new Date().toISOString().slice(0, 10);
      const key = createHash("sha256").update(`${accountId}:${requestId}`).digest("hex");
      const existing = ledger.attempts[key];
      if (existing) throw new SpendError(existing.hash === payloadHash ? "Request already attempted; no additional provider call. Use the saved result or ask a new question." : "Idempotency key reused with different content", 409);
      // A UTF-8 byte upper bound is conservative for model input tokens; include prompt/schema overhead.
      const estimate = (contextBytes + 16000) * Math.max(policy.prices.input, policy.prices.cached) / 1e6 + 3000 * policy.prices.output / 1e6;
      const amount = micro(policy.perRequestUsd);
      if (estimate > policy.perRequestUsd) throw new SpendError("Selected context exceeds the configured per-request spending ceiling");
      const account = `${day}:account:${accountId}`, global = `${day}:global`;
      if ((ledger.totals[account] || 0) + amount > micro(policy.accountDailyUsd) ||
        (ledger.totals[global] || 0) + amount > micro(policy.globalDailyUsd)) throw new SpendError("Daily AI spending ceiling reached. Offline evidence remains available.");
      // Reserve durably before invoking a provider. Unknown/failed/cancelled usage is not refunded.
      ledger.totals[account] = (ledger.totals[account] || 0) + amount;
      ledger.totals[global] = (ledger.totals[global] || 0) + amount;
      ledger.attempts[key] = { hash: payloadHash, reserved: amount, day };
      persist();
      return { reservedUsd: amount / 1e6, accountReservedUsd: ledger.totals[account] / 1e6, globalReservedUsd: ledger.totals[global] / 1e6 };
    },
    close() {
      if (lock !== undefined && policy.ledgerPath) {
        closeSync(lock); lock = undefined; unlinkSync(`${policy.ledgerPath}.lock`);
      }
    },
  };
}
