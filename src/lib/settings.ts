export interface Settings {
  apiBase: string;
  explorerBase: string;
  feePerKb: number;
}

const LS_SETTINGS = 'mnemonic-brc100-settings';

// Ceiling is a sanity bound: a fat-fingered rate would otherwise burn the
// balance as fee.
export const MAX_FEE_PER_KB = 100_000;

export const DEFAULT_SETTINGS: Settings = {
  apiBase: 'https://api.whatsonchain.com/v1/bsv/main',
  explorerBase: 'https://whatsonchain.com/tx/',
  feePerKb: 100,
};

export const isHttps = (url: string) => /^https:\/\//i.test(url);

// Anything not a usable whole rate falls back to the default; absurd values
// clamp. A 0 here would build a zero-fee tx no miner accepts.
export function sanitizeFee(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_SETTINGS.feePerKb;
  return Math.min(n, MAX_FEE_PER_KB);
}

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_SETTINGS) ?? '{}') ?? {};
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    // A tampered localStorage must not smuggle in a javascript: URL.
    if (!isHttps(merged.apiBase)) merged.apiBase = DEFAULT_SETTINGS.apiBase;
    if (!isHttps(merged.explorerBase)) merged.explorerBase = DEFAULT_SETTINGS.explorerBase;
    merged.feePerKb = sanitizeFee(merged.feePerKb);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode etc.); settings still apply for this session.
  }
}

export function explorerHref(settings: Settings, txid: string): string | null {
  const href = `${settings.explorerBase}${encodeURIComponent(txid)}`;
  return isHttps(href) ? href : null;
}
