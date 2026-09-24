import type { Api, OrdinalTxo } from './net';

// Every spend MUST run its UTXOs through protectedSet() before building. A
// 1-sat ordinal or a BSV-20-bearing UTXO spent as a plain sat is burned: paid
// to fee or folded into change. Recovery users are exactly the people most
// likely to have stray ordinals at deep derivation paths.
//
// HARD POLICY: indexer unreachable => refuse to build. There is no "I accept
// the risk" override.

const hasKeys = (o: unknown) => !!o && typeof o === 'object' && Object.keys(o).length > 0;

export const outpointKey = (txid: string, vout: number) => `${txid}:${vout}`;

/**
 * Conservative: anything the overlay attaches an origin or parsed data to
 * (inscription, BSV-20/21, lock, listing, MAP…) is treated as not-a-plain-sat.
 */
export function isProtectedTxo(txo: OrdinalTxo | null | undefined): boolean {
  if (!txo || typeof txo !== 'object') return false;
  return !!txo.origin || hasKeys(txo.data);
}

/** Set of "txid:vout" for every protected UTXO at address. Throws on indexer error. */
export async function protectedSet(api: Api, address: string): Promise<Set<string>> {
  let raw: OrdinalTxo[];
  try {
    raw = await api.ordinals.unspent(address);
  } catch (e) {
    throw new Error(`Couldn't reach the NFT/token check (${(e as Error).message}). To keep your NFTs and tokens safe, nothing was sent. Try again in a moment.`);
  }
  const set = new Set<string>();
  for (const txo of raw) if (isProtectedTxo(txo)) set.add(outpointKey(txo.txid, txo.vout));
  return set;
}

export interface Spendable { txid: string; vout: number; satoshis: number }

/**
 * Drops protected outpoints, and every 1-satoshi output as a second line of
 * defence: 1Sat ordinals live in 1-sat outputs, and even a genuinely plain
 * 1-sat UTXO costs more in fee to spend than it is worth.
 */
export function filterSpendable<T extends Spendable>(utxos: T[], protectedOutpoints: Set<string>) {
  const spendable: T[] = [];
  let protectedCount = 0;
  for (const u of utxos) {
    if (u.satoshis <= 1 || protectedOutpoints.has(outpointKey(u.txid, u.vout))) protectedCount++;
    else spendable.push(u);
  }
  return { spendable, protectedCount };
}

export const shieldNote = (n: number) => n ? ` ${n} coin(s) holding NFTs or tokens were left alone so they stay safe.` : '';

export interface OrdinalSummary {
  outpoint: string;
  satoshis: number;
  name: string;
  app: string;
  type: string;
  size: number;
  num: string;
  kind: string;
}

export function describeOrdinal(txo: OrdinalTxo): OrdinalSummary {
  const data = (txo.origin?.data ?? txo.data ?? {}) as Record<string, unknown>;
  const map = (data.map ?? {}) as Record<string, string>;
  const insc = (data.insc ?? {}) as { file?: { type?: string; size?: number } };
  const kind = data.bsv20 || txo.data?.bsv20 ? 'BSV-20' : data.insc ? 'Inscription' : data.lock ? 'Lock' : 'Ordinal';
  return {
    outpoint: txo.outpoint || outpointKey(txo.txid, txo.vout),
    satoshis: txo.satoshis,
    name: map.name || '',
    app: map.app || '',
    type: insc.file?.type || '',
    size: insc.file?.size || 0,
    num: String(txo.origin?.num ?? ''),
    kind,
  };
}
