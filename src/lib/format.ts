export const SATS_PER_BSV = 100_000_000;

export const fmtSats = (n: number | string) => new Intl.NumberFormat('en-US').format(Number(n || 0));

export function fmtUsd(sats: number, price: number): string {
  if (!price) return '— USD';
  const usd = (sats * price) / SATS_PER_BSV;
  return '$' + (usd >= 0.01 || usd === 0 ? usd.toFixed(2) : usd.toFixed(6));
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function safeInt(value: unknown, fallback = 0): number {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
