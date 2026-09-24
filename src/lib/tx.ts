import { P2PKH, SatoshisPerKilobyte, Transaction, type PrivateKey } from '@bsv/sdk';
import type { Api } from './net';
import { isValidAddress } from './derive';

export interface SpendInput {
  txid: string;
  vout: number;
  satoshis: number;
  address: string;
  privateKey: PrivateKey;
}

export interface BuiltTx {
  tx: Transaction;
  hex: string;
  txid: string;
  totalIn: number;
  totalOut: number;
  fee: number;
  size: number;
}

/**
 * Fetches each source transaction and checks it really pays the claimed
 * amount to the claimed address. Signing commits to the source amount, so an
 * API that lied about a UTXO's value could otherwise trick us into burning fee.
 */
async function loadSources(api: Api, inputs: SpendInput[], onProgress?: (m: string) => void) {
  const sources = new Map<string, Transaction>();
  for (const txid of new Set(inputs.map(i => i.txid))) {
    onProgress?.(`Checking coin ${txid.slice(0, 16)}…`);
    const tx = Transaction.fromHex(await api.woc.txHex(txid));
    if (tx.id('hex') !== txid) throw new Error(`The data for transaction ${txid} didn't check out, so we stopped to keep you safe.`);
    sources.set(txid, tx);
  }
  for (const input of inputs) {
    const out = sources.get(input.txid)!.outputs[input.vout];
    const expected = new P2PKH().lock(input.address).toHex();
    if (!out) throw new Error(`Coin ${input.txid}:${input.vout} doesn't exist.`);
    if (out.satoshis !== input.satoshis) throw new Error(`Coin ${input.txid}:${input.vout} holds ${out.satoshis} sats, not the ${input.satoshis} we were told, so we stopped to keep you safe.`);
    if (out.lockingScript.toHex() !== expected) throw new Error(`Coin ${input.txid}:${input.vout} isn't a plain payment to ${input.address} (it may hold an NFT), so we won't spend it.`);
  }
  return sources;
}

/**
 * Builds and signs a P2PKH transaction. `outputs` are fixed payments; all
 * remaining value (minus fee) goes to `changeAddress`. For a sweep, pass no
 * outputs and the destination as `changeAddress`.
 */
export async function buildP2pkhTransaction(params: {
  api: Api;
  inputs: SpendInput[];
  outputs: { address: string; satoshis: number }[];
  changeAddress: string;
  feePerKb: number;
  onProgress?: (m: string) => void;
}): Promise<BuiltTx> {
  const { api, inputs, outputs, changeAddress, feePerKb, onProgress } = params;
  if (!inputs.length) throw new Error('No coins to spend.');
  for (const o of outputs) {
    if (!isValidAddress(o.address)) throw new Error(`"${o.address}" isn't a valid BSV address.`);
    if (!Number.isInteger(o.satoshis) || o.satoshis < 1) throw new Error('Amounts must be whole sats, at least 1.');
  }
  if (!isValidAddress(changeAddress)) throw new Error(`"${changeAddress}" isn't a valid BSV address.`);

  const sources = await loadSources(api, inputs, onProgress);
  const tx = new Transaction();
  for (const input of inputs) {
    tx.addInput({
      sourceTransaction: sources.get(input.txid)!,
      sourceOutputIndex: input.vout,
      unlockingScriptTemplate: new P2PKH().unlock(input.privateKey),
    });
  }
  for (const o of outputs) tx.addOutput({ lockingScript: new P2PKH().lock(o.address), satoshis: o.satoshis });
  tx.addOutput({ lockingScript: new P2PKH().lock(changeAddress), change: true });

  onProgress?.('Working out the fee and signing…');
  const feeModel = new SatoshisPerKilobyte(feePerKb);
  await tx.fee(feeModel);
  await tx.sign();

  const totalIn = inputs.reduce((s, i) => s + i.satoshis, 0);
  const totalOut = tx.outputs.reduce((s, o) => s + (o.satoshis ?? 0), 0);
  const fee = totalIn - totalOut;
  const hex = tx.toHex();
  const size = hex.length / 2;

  // tx.fee() silently drops a change output that would be <= 0 instead of
  // throwing, so insufficient funds shows up here as an underpaid fee.
  const required = await feeModel.computeFee(tx);
  if (!tx.outputs.length) throw new Error('Nothing is left to send after the network fee.');
  if (fee < required) {
    const requested = outputs.reduce((s, o) => s + o.satoshis, 0);
    throw new Error(`Not enough funds: you have ${totalIn} sats, but this needs ${requested} sats plus a ${required}-sat fee.`);
  }
  if (fee > required + 1000 && fee > required * 2) throw new Error(`The fee came out at ${fee} sats instead of about ${required}, so we stopped.`);
  for (let i = 0; i < tx.inputs.length; i++) {
    if (!tx.inputs[i].unlockingScript) throw new Error(`Coin ${i + 1} couldn't be signed, so we stopped.`);
  }

  return { tx, hex, txid: tx.id('hex'), totalIn, totalOut, fee, size };
}
