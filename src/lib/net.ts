import type { Settings } from './settings';

// WhatsOnChain's free tier is roughly 3 requests/second. Calls are serialized
// through a limiter at this interval; going faster just earns 429s, and a 429
// during a recovery scan is how a tool silently under-reports someone's coins.
const WOC_MIN_INTERVAL_MS = 350;
const RETRY_ATTEMPTS = 4;
const ORDINALS_API = 'https://ordinals.gorillapool.io/api';
const ORDINALS_PAGE = 100;
const ORDINALS_MAX_PAGES = 50;

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Serializes every call and spaces them by at least `interval` ms. */
export function createLimiter(interval: number) {
  let tail: Promise<unknown> = Promise.resolve();
  let last = 0;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = async () => {
      const wait = last + interval - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      return fn();
    };
    // Keep the chain alive even when a call rejects.
    const result = tail.then(run, run);
    tail = result.then(() => {}, () => {});
    return result;
  };
}
const wocLimit = createLimiter(WOC_MIN_INTERVAL_MS);

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request(url: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    throw new Error(`Network request failed (${(e as Error).message}).`);
  }
  const raw = await response.text();
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const body = data as { message?: string; error?: string } | string | null;
    const message = typeof body === 'string' && body ? body
      : (typeof body === 'object' && body ? (body.message || body.error) : '') || `HTTP ${response.status}`;
    throw new HttpError(response.status, message);
  }
  return data;
}

const isRetryable = (e: unknown) => e instanceof HttpError
  ? (e.status === 429 || e.status >= 500)
  : true;   // network-level failures are worth one more try

// Retries with exponential backoff, then gives up by THROWING. Callers must
// let that abort the operation: quietly continuing past a failed address is
// what makes a recovery scan under-report funds.
export async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = RETRY_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e) || attempt === attempts) break;
      await sleep(400 * 2 ** (attempt - 1));   // 400, 800, 1600 ms
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${(lastError as Error).message}`);
}

export interface WocUtxo {
  height: number;
  tx_pos: number;
  tx_hash: string;
  value: number;
  isSpentInMempoolTx?: boolean;
}

export interface WocHistoryRow {
  tx_hash: string;
  height?: number;
  time?: number;
}

/** A 1Sat overlay TXO, as returned by GorillaPool. Only the fields we read. */
export interface OrdinalTxo {
  txid: string;
  vout: number;
  outpoint?: string;
  satoshis: number;
  origin?: { num?: string | number; outpoint?: string; data?: Record<string, unknown> | null } | null;
  data?: Record<string, unknown> | null;
}

export interface Bsv20Balance {
  tick?: string;
  sym?: string;
  id?: string;
  dec?: number;
  all?: { confirmed?: string | number; pending?: string | number };
  confirmed?: string | number;
}

export type Api = ReturnType<typeof createApi>;

export function createApi(settings: Settings) {
  const woc = <T>(path: string, label: string) =>
    withRetry(() => wocLimit(() => request(`${settings.apiBase}${path}`)), label) as Promise<T>;
  const enc = encodeURIComponent;

  // Pages through the overlay. Truncating here would leave ordinals out of the
  // protected set, so hitting the page cap is an error, not a partial result.
  async function allTxos(address: string, bsv20: boolean): Promise<OrdinalTxo[]> {
    const out: OrdinalTxo[] = [];
    for (let page = 0; page < ORDINALS_MAX_PAGES; page++) {
      const url = `${ORDINALS_API}/txos/address/${enc(address)}/unspent?bsv20=${bsv20}&limit=${ORDINALS_PAGE}&offset=${page * ORDINALS_PAGE}`;
      const batch = await withRetry(() => request(url), `Ordinal indexer lookup for ${address}`);
      if (!Array.isArray(batch)) throw new Error('Ordinal indexer returned an unexpected shape.');
      out.push(...batch as OrdinalTxo[]);
      if (batch.length < ORDINALS_PAGE) return out;
    }
    throw new Error(`Address ${address} holds more than ${ORDINALS_PAGE * ORDINALS_MAX_PAGES} indexed outputs — too many to verify.`);
  }

  return {
    woc: {
      balance: (a: string) => woc<{ confirmed: number; unconfirmed: number }>(`/address/${enc(a)}/balance`, `Balance lookup for ${a}`),

      /** Unspent outputs, minus any already spent by a mempool transaction. */
      unspent: async (a: string): Promise<WocUtxo[]> => {
        const data = await woc<{ result?: WocUtxo[] } | WocUtxo[]>(`/address/${enc(a)}/unspent/all`, `UTXO lookup for ${a}`);
        const rows = Array.isArray(data) ? data : data?.result;
        if (!Array.isArray(rows)) throw new Error(`Unexpected UTXO response for ${a}.`);
        return rows.filter(u => !u.isSpentInMempoolTx);
      },

      history: async (a: string): Promise<WocHistoryRow[]> => {
        try {
          const data = await woc<WocHistoryRow[] | { result?: WocHistoryRow[] }>(`/address/${enc(a)}/history`, `History lookup for ${a}`);
          const rows = Array.isArray(data) ? data : data?.result;
          if (!Array.isArray(rows)) throw new Error(`Unexpected history response for ${a}.`);
          return rows;
        } catch (e) {
          if (/\b404\b|not found/i.test((e as Error).message)) return [];   // unused address
          throw e;
        }
      },

      price: () => woc<{ rate: number; currency?: string }>('/exchangerate', 'Exchange rate lookup'),

      txHex: async (txid: string): Promise<string> => {
        const data = await woc<unknown>(`/tx/${enc(txid)}/hex`, `Source transaction ${txid}`);
        if (typeof data !== 'string' || !/^[0-9a-f]+$/i.test(data.trim())) throw new Error(`Unexpected transaction response for ${txid}.`);
        return data.trim();
      },

      beefHex: async (txid: string): Promise<string> => {
        const data = await woc<unknown>(`/tx/${enc(txid)}/beef`, `BEEF for ${txid}`);
        if (typeof data !== 'string' || !/^[0-9a-f]+$/i.test(data.trim())) throw new Error(`Unexpected BEEF response for ${txid}.`);
        return data.trim();
      },

      // Deliberately NOT retried: a "failure" may still have been accepted.
      broadcast: async (txhex: string): Promise<string> => {
        const result = await wocLimit(() => request(`${settings.apiBase}/tx/raw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txhex }),
        }));
        if (typeof result === 'string') return result.trim().replace(/^"|"$/g, '');
        const r = result as { txid?: string; result?: string } | null;
        return r?.txid || r?.result || JSON.stringify(result);
      },
    },

    // GorillaPool's 1Sat overlay: the per-address endpoint answers "is this
    // UTXO safe to spend as a plain sat?". BSV-20 token outputs are only
    // returned with bsv20=true, so both views are fetched.
    ordinals: {
      unspent: async (a: string): Promise<OrdinalTxo[]> => {
        const [plain, tokens] = await Promise.all([allTxos(a, false), allTxos(a, true)]);
        return [...plain, ...tokens];
      },
      bsv20Balance: (a: string) =>
        withRetry(() => request(`${ORDINALS_API}/bsv20/${enc(a)}/balance`), `BSV-20 lookup for ${a}`) as Promise<Bsv20Balance[]>,
    },
  };
}
