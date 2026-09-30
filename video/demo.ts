/*
 * The demo wallet the explainer shows: a real, valid 12-word phrase (cave
 * words), the Centbee addresses it derives, and made-up coins on a few of
 * them. Nothing here exists on the blockchain.
 *
 *   npx tsx video/demo.ts
 *
 * Writes:
 *   video/demo.json  what capture.py answers the app's WhatsOnChain and
 *                    GorillaPool calls with, so a scan finds these coins and
 *                    the sweep signs against real-looking source transactions
 *   video/demo.js    the same addresses and amounts for stage.js, so the cave's
 *                    chambers show what the app later finds
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hash, P2PKH, PrivateKey, Transaction, UnlockingScript, Utils } from '@bsv/sdk';
import { deriveKey, presetById, rootFromMnemonic, validateMnemonic } from '../src/lib/derive';

const HERE = dirname(fileURLToPath(import.meta.url));

export const PHRASE = 'secret cave door open torch light path tunnel echo hidden gold chest';
const PRESET = 'centbee';
// sats on each address index; 2 was used and emptied, so the scan walks past it
const COINS: Record<number, number> = { 0: 84_210_000, 1: 31_200_000, 3: 150_000_000 };
const SPENT = [2];
const SHOWN = 6;
const PRICE = 27.5;

const template = presetById(PRESET)!.template;
const root = rootFromMnemonic(validateMnemonic(PHRASE), '');

// a deterministic stand-in for a txid we never look up
const fakeId = (seed: string) => Utils.toHex(Hash.sha256(Utils.toArray(seed, 'utf8')));

/** A transaction paying `sats` to `address`, from an input that doesn't exist. */
function funding(address: string, sats: number, seed: string) {
  const tx = new Transaction();
  tx.addInput({ sourceTXID: fakeId(seed), sourceOutputIndex: 0, unlockingScript: UnlockingScript.fromASM('OP_0'), sequence: 0xffffffff });
  tx.addOutput({ lockingScript: new P2PKH().lock(address), satoshis: sats });
  return { txid: tx.id('hex'), hex: tx.toHex() };
}

const addresses: Record<string, { history: { tx_hash: string; height: number }[]; unspent: { height: number; tx_pos: number; tx_hash: string; value: number }[] }> = {};
const txs: Record<string, string> = {};
const chambers = [];
for (let index = 0; index < SHOWN; index++) {
  const key = deriveKey(root, template, 0, index);
  const sats = COINS[index] ?? 0;
  const entry: (typeof addresses)[string] = { history: [], unspent: [] };
  if (sats) {
    const { txid, hex } = funding(key.address, sats, `${key.address}:in`);
    txs[txid] = hex;
    entry.history.push({ tx_hash: txid, height: 812_400 + index * 97 });
    entry.unspent.push({ height: 812_400 + index * 97, tx_pos: 0, tx_hash: txid, value: sats });
  }
  if (SPENT.includes(index)) {
    entry.history.push({ tx_hash: fakeId(`${key.address}:in`), height: 790_011 }, { tx_hash: fakeId(`${key.address}:out`), height: 790_502 });
  }
  if (entry.history.length) addresses[key.address] = entry;
  chambers.push({ index, path: key.path, address: key.address, sats, txs: entry.history.length });
}

// where the sweep in the video sends everything: an address of its own
const destination = new PrivateKey(Utils.toHex(Hash.sha256(Utils.toArray('derivation path explainer', 'utf8'))), 16).toAddress();

writeFileSync(join(HERE, 'demo.json'), JSON.stringify({ phrase: PHRASE, preset: PRESET, price: PRICE, destination, addresses, txs }, null, 1) + '\n');
writeFileSync(join(HERE, 'demo.js'),
  '// Made by video/demo.ts. The demo wallet the cave scenes show.\n' +
  `window.DEMO = ${JSON.stringify({ phrase: PHRASE, template, chambers }, null, 1)};\n`);
console.log(`${Object.keys(addresses).length} used addresses, ${Object.keys(txs).length} coins; sweep to ${destination}`);
for (const c of chambers) console.log(`  #${c.index} ${c.path} ${c.address} ${c.sats} sats`);
