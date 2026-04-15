export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function formatEta(remaining: number, avgSec: number): string {
  const total = Math.round(avgSec * remaining);
  if (total <= 0) return "—";
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function formatPct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}
