import { Usage } from "./acp";

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);

export const fmtCost = (c: NonNullable<Usage["cost"]>) =>
  `${c.currency === "USD" ? "$" : c.currency + " "}${c.amount < 0.01 ? c.amount.toFixed(4) : c.amount.toFixed(3)}`;

/** Label/value rows for a usage readout; empty if the agent reported nothing yet. */
export function usageRows(u?: Partial<Usage>): { title: string; text: string }[] {
  if (!u) return [];
  const rows: { title: string; text: string }[] = [];
  if (u.used != null && u.size) {
    rows.push({
      title: "Context",
      text: `${fmtTokens(u.used)} / ${fmtTokens(u.size)} (${Math.round((u.used / u.size) * 100)}%)`,
    });
  }
  if (u.input != null || u.output != null) {
    rows.push({ title: "This turn", text: `${fmtTokens(u.input ?? 0)} in · ${fmtTokens(u.output ?? 0)} out` });
  }
  if (u.cached) rows.push({ title: "Cached", text: fmtTokens(u.cached) });
  if (u.reasoning) rows.push({ title: "Reasoning", text: fmtTokens(u.reasoning) });
  if (u.cost) rows.push({ title: "Cost", text: fmtCost(u.cost) });
  if (u.model) rows.push({ title: "Model", text: u.model });
  return rows;
}

export const usageSummary = (u?: Partial<Usage>) =>
  u?.used != null && u.size ? `${fmtTokens(u.used)}/${fmtTokens(u.size)}` : undefined;
