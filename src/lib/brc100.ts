import { Beef, P2PKH, Transaction, Utils, type CreateActionInput, type PositiveIntegerOrZero, type SignActionSpend, type WalletClient } from '@bsv/sdk';
import type { Api } from './net';
import type { SpendInput } from './tx';

// Reject anything above this. The wallet picks the fee, we just sanity-check it.
const MAX_SATS_PER_KB = 1000;

export const WALLET_MISSING = "Couldn't reach your BRC-100 wallet. Open Metanet Desktop (get it at https://metanet.bsvb.tech) and try again.";

export async function requireWallet(wallet: WalletClient) {
  try {
    const { authenticated } = await wallet.isAuthenticated();
    if (!authenticated) throw new Error(WALLET_MISSING);
  } catch {
    throw new Error(WALLET_MISSING);
  }
}

/**
 * Sweeps UTXOs into a local BRC-100 wallet (e.g. Metanet Desktop): the wallet
 * assigns the outputs via createAction, we sign each input with the derived
 * key (SIGHASH_ALL, so the wallet can't alter the tx), then signAction
 * broadcasts it.
 */
export async function sweepToBrc100(params: {
  api: Api;
  wallet: WalletClient;
  inputs: SpendInput[];
  onProgress?: (m: string) => void;
}): Promise<{ txid: string; hex: string }> {
  const { api, wallet, inputs, onProgress } = params;
  if (!inputs.length) throw new Error('No coins to move.');
  await requireWallet(wallet);

  const keyByOutpoint = new Map(inputs.map(i => [`${i.txid}.${i.vout}`, i.privateKey]));
  const beef = new Beef();
  const actionInputs: CreateActionInput[] = [];

  const sources = new Map<string, Transaction>();
  for (const txid of new Set(inputs.map(i => i.txid))) {
    onProgress?.(`Getting coin details (${txid.slice(0, 16)}…)`);
    const beefHex = await api.woc.beefHex(txid);
    beef.mergeBeef(Utils.toArray(beefHex, 'hex'));
    sources.set(txid, Transaction.fromHexBEEF(beefHex, txid));
  }
  for (const i of inputs) {
    // Same guard as the local builder: only plain P2PKH outputs of the
    // reported value. An inscription envelope fails this and is never swept.
    const out = sources.get(i.txid)?.outputs[i.vout];
    if (!out || out.satoshis !== i.satoshis || out.lockingScript.toHex() !== new P2PKH().lock(i.address).toHex()) {
      throw new Error(`Coin ${i.txid}:${i.vout} isn't a plain ${i.satoshis}-sat payment to ${i.address} (it may hold an NFT), so we won't move it.`);
    }
    actionInputs.push({ inputDescription: 'from mnemonic', unlockingScriptLength: 108, outpoint: `${i.txid}.${i.vout}` });
  }

  onProgress?.('Asking your wallet where to put the coins…');
  const { signableTransaction } = await wallet.createAction({
    inputBEEF: beef.toBinary(),
    description: 'Ingesting Swept funds from mnemonic',
    inputs: actionInputs,
  });
  if (!signableTransaction) throw new Error("Your wallet didn't accept the request.");

  const tx = Transaction.fromAtomicBEEF(signableTransaction.tx);

  const sats = tx.getFee();
  const satsPerKb = sats / (tx.toBinary().length / 1000);
  if (sats > 1 && satsPerKb > MAX_SATS_PER_KB) throw new Error(`Your wallet asked for a ${sats}-sat fee (${Math.round(satsPerKb)} sats per KB). That's too high, so we stopped.`);

  onProgress?.('Signing…');
  tx.inputs.forEach(input => {
    const txid = input.sourceTransaction!.id('hex');
    const privKey = keyByOutpoint.get(`${txid}.${input.sourceOutputIndex}`);
    if (!privKey) throw new Error(`Couldn't find the key for coin ${txid}.${input.sourceOutputIndex}.`);
    input.unlockingScriptTemplate = new P2PKH().unlock(privKey);
  });
  await tx.sign();

  const spends: Record<PositiveIntegerOrZero, SignActionSpend> = {};
  tx.inputs.forEach((input, index) => {
    spends[index] = { unlockingScript: input.unlockingScript!.toHex() };
  });

  onProgress?.('Sending…');
  const { txid } = await wallet.signAction({
    reference: signableTransaction.reference,
    spends,
    options: { acceptDelayedBroadcast: false, returnTXIDOnly: true },
  });
  if (!txid) throw new Error("The transaction couldn't be sent.");
  return { txid, hex: tx.toHex() };
}
