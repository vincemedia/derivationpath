import { describe, expect, it } from 'vitest';
import { P2PKH, PrivateKey, Script, Spend, Transaction } from '@bsv/sdk';
import {
  PRESETS, deriveKey, generateMnemonic, isValidAddress, resolvePath, rootFromMnemonic,
  validateMnemonic, validateTemplate,
} from '../derive';
import { filterSpendable, isProtectedTxo, outpointKey } from '../tokens';
import { decryptVault, encryptVault, requireStrongPassword, type SeedRecord } from '../vault';
import { buildP2pkhTransaction } from '../tx';
import { scanForUtxos } from '../scan';
import type { Api } from '../net';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('derivation', () => {
  it('reproduces the BIP44 abandon…about vector at m/44\'/0\'/0\'/0/0', () => {
    const root = rootFromMnemonic(ABANDON, '');
    expect(deriveKey(root, "m/44'/0'/0'/{chain}/{index}", 0, 0).address).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
  });

  it('matches the legacy prefix+index derivation the tool originally used', () => {
    const root = rootFromMnemonic(ABANDON, '');
    const legacy = root.derive("m/44'/0/0/3").privKey.toPublicKey().toAddress().toString();
    expect(deriveKey(root, "m/44'/0/0/{index}", 0, 3).address).toBe(legacy);
  });

  it('treats the passphrase as seed material', () => {
    const a = deriveKey(rootFromMnemonic(ABANDON, ''), PRESETS[0].template, 0, 0).address;
    const b = deriveKey(rootFromMnemonic(ABANDON, '1234'), PRESETS[0].template, 0, 0).address;
    expect(a).not.toBe(b);
  });

  it('generates phrases of the requested length', () => {
    expect(generateMnemonic(128).split(' ')).toHaveLength(12);
    expect(generateMnemonic(256).split(' ')).toHaveLength(24);
    expect(() => generateMnemonic(100)).toThrow();
  });

  it('normalizes and rejects bad phrases', () => {
    expect(validateMnemonic(`  ${ABANDON.toUpperCase()}  `)).toBe(ABANDON);
    expect(() => validateMnemonic(ABANDON.replace('about', 'abandon'))).toThrow(/checksum/);
    expect(() => validateMnemonic('abandon abandon')).toThrow(/12, 15, 18, 21 or 24/);
  });

  it('validates templates', () => {
    expect(validateTemplate(" m/44’/0h/0'/{chain}/{index} ")).toBe("m/44'/0'/0'/{chain}/{index}");
    expect(resolvePath("m/0'/{chain}'/{index}'", 1, 7)).toBe("m/0'/1'/7'");
    expect(() => validateTemplate("m/44'/0'/0'")).toThrow(/\{index\}/);
    expect(() => validateTemplate("44'/0/{index}")).toThrow(/start with/);
    expect(() => validateTemplate('m/abc/{index}')).toThrow(/Invalid path segment/);
    for (const p of PRESETS) expect(validateTemplate(p.template)).toBe(p.template);
  });

  it('checks mainnet P2PKH addresses', () => {
    expect(isValidAddress('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA')).toBe(true);
    expect(isValidAddress('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabB')).toBe(false);
    expect(isValidAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(false);   // testnet
  });
});

describe('ordinal protection', () => {
  it('flags anything the overlay attaches an origin or data to', () => {
    expect(isProtectedTxo({ txid: 'a', vout: 0, satoshis: 1, origin: { data: { insc: {} } } })).toBe(true);
    expect(isProtectedTxo({ txid: 'a', vout: 0, satoshis: 1, origin: null, data: { bsv20: {} } })).toBe(true);
    expect(isProtectedTxo({ txid: 'a', vout: 0, satoshis: 5000, origin: null, data: null })).toBe(false);
    expect(isProtectedTxo({ txid: 'a', vout: 0, satoshis: 5000, origin: null, data: {} })).toBe(false);
  });

  it('excludes protected outpoints and every 1-sat output', () => {
    const utxos = [
      { txid: 'a', vout: 0, satoshis: 1000 },
      { txid: 'b', vout: 1, satoshis: 1 },          // stray ordinal the indexer missed
      { txid: 'c', vout: 2, satoshis: 5000 },       // indexer-flagged
    ];
    const { spendable, protectedCount } = filterSpendable(utxos, new Set([outpointKey('c', 2)]));
    expect(spendable.map(u => u.txid)).toEqual(['a']);
    expect(protectedCount).toBe(2);
  });
});

describe('vault', () => {
  const record: SeedRecord = { mnemonic: ABANDON, passphrase: 'pin', template: "m/44'/0/0/{index}", presetId: 'centbee', chain: 0, index: 4 };

  it('round-trips and rejects a wrong password', async () => {
    const payload = await encryptVault(record, 'correct horse battery');
    expect(JSON.stringify(payload)).not.toContain('abandon');
    expect(await decryptVault(payload, 'correct horse battery')).toEqual(record);
    await expect(decryptVault(payload, 'wrong password!!')).rejects.toThrow(/Wrong password/);
  });

  it('restores SatoFinder backups into templates', async () => {
    const sato = { mnemonic: ABANDON, passphrase: '', path: "m/44'/236'/0'/1/9", preset: 'exodus', mode: '44' };
    const payload = { ...(await encryptVault(sato as unknown as SeedRecord, 'correct horse battery')), format: 'satofinder-aes-gcm-v2' };
    expect(await decryptVault(payload, 'correct horse battery')).toMatchObject({
      template: "m/44'/236'/0'/{chain}/{index}", chain: 1, index: 9,
    });
  });

  it('refuses hostile iteration counts and unknown formats', async () => {
    const payload = await encryptVault(record, 'correct horse battery');
    await expect(decryptVault({ ...payload, iterations: 1e9 }, 'x')).rejects.toThrow(/iteration/);
    await expect(decryptVault({ ...payload, format: 'nope' }, 'x')).rejects.toThrow(/format/);
  });

  it('enforces password rules', () => {
    expect(() => requireStrongPassword('short', 'short')).toThrow(/10 characters/);
    expect(() => requireStrongPassword('long enough 1', 'long enough 2')).toThrow(/match/);
  });
});

// A source tx paying `sats` to each address, served by a fake API.
function fixture(payments: { address: string; satoshis: number; script?: Script }[]) {
  const source = new Transaction();
  source.addInput({ sourceTXID: '00'.repeat(32), sourceOutputIndex: 0, unlockingScript: new Script() });
  for (const p of payments) source.addOutput({ lockingScript: p.script ?? new P2PKH().lock(p.address), satoshis: p.satoshis });
  const api = { woc: { txHex: async () => source.toHex() } } as unknown as Api;
  return { api, txid: source.id('hex') };
}

describe('transaction building', () => {
  const key = PrivateKey.fromRandom();
  const address = key.toAddress().toString();
  const dest = PrivateKey.fromRandom().toAddress().toString();

  it('builds, signs and balances a send with change', async () => {
    const { api, txid } = fixture([{ address, satoshis: 100_000 }]);
    const built = await buildP2pkhTransaction({
      api, inputs: [{ txid, vout: 0, satoshis: 100_000, address, privateKey: key }],
      outputs: [{ address: dest, satoshis: 40_000 }], changeAddress: address, feePerKb: 100,
    });
    expect(built.tx.outputs).toHaveLength(2);
    expect(built.tx.outputs[0].satoshis).toBe(40_000);
    expect(built.totalIn).toBe(built.totalOut + built.fee);
    expect(built.fee).toBeGreaterThan(0);
    expect(built.fee).toBeLessThan(100);
    // Script-level check of the signature against the real source output.
    const input = built.tx.inputs[0];
    const source = input.sourceTransaction!.outputs[0];
    expect(new Spend({
      sourceTXID: txid, sourceOutputIndex: 0, sourceSatoshis: source.satoshis!, lockingScript: source.lockingScript,
      transactionVersion: built.tx.version, otherInputs: [], outputs: built.tx.outputs, inputIndex: 0,
      unlockingScript: input.unlockingScript!, inputSequence: input.sequence ?? 0xffffffff, lockTime: built.tx.lockTime,
    }).validate()).toBe(true);
  });

  it('sweeps everything to one destination', async () => {
    const { api, txid } = fixture([{ address, satoshis: 30_000 }, { address, satoshis: 20_000 }]);
    const built = await buildP2pkhTransaction({
      api, inputs: [0, 1].map(vout => ({ txid, vout, satoshis: vout ? 20_000 : 30_000, address, privateKey: key })),
      outputs: [], changeAddress: dest, feePerKb: 100,
    });
    expect(built.tx.outputs).toHaveLength(1);
    expect(built.totalOut).toBe(50_000 - built.fee);
  });

  it('refuses when the API misreports an amount', async () => {
    const { api, txid } = fixture([{ address, satoshis: 5_000 }]);
    await expect(buildP2pkhTransaction({
      api, inputs: [{ txid, vout: 0, satoshis: 900_000, address, privateKey: key }],
      outputs: [], changeAddress: dest, feePerKb: 100,
    })).rejects.toThrow(/not 900000/);
  });

  it('refuses to spend a non-plain (inscription) output', async () => {
    const inscribed = Script.fromHex(new P2PKH().lock(address).toHex() + '0063036f72645168');
    const { api, txid } = fixture([{ address, satoshis: 5_000, script: inscribed }]);
    await expect(buildP2pkhTransaction({
      api, inputs: [{ txid, vout: 0, satoshis: 5_000, address, privateKey: key }],
      outputs: [], changeAddress: dest, feePerKb: 100,
    })).rejects.toThrow(/not a plain P2PKH/);
  });

  it('reports insufficient funds instead of underpaying the fee', async () => {
    const { api, txid } = fixture([{ address, satoshis: 1_000 }]);
    await expect(buildP2pkhTransaction({
      api, inputs: [{ txid, vout: 0, satoshis: 1_000, address, privateKey: key }],
      outputs: [{ address: dest, satoshis: 999 }], changeAddress: address, feePerKb: 100,
    })).rejects.toThrow(/Insufficient funds/);
  });
});

describe('gap-limit scan', () => {
  it('walks until the gap limit, filters ordinals and aborts on API failure', async () => {
    const root = rootFromMnemonic(ABANDON, '');
    const template = "m/44'/0'/0'/{chain}/{index}";
    const used = new Map([0, 2].map(i => [deriveKey(root, template, 0, i).address, i]));
    const calls: string[] = [];
    const api = {
      woc: {
        history: async (a: string) => { calls.push(a); return used.has(a) ? [{ tx_hash: 'h' }] : []; },
        unspent: async (a: string) => used.get(a) === 2
          ? [{ tx_hash: 'f'.repeat(64), tx_pos: 0, value: 7000, height: 1 }, { tx_hash: 'e'.repeat(64), tx_pos: 1, value: 1, height: 1 }]
          : [],
      },
      ordinals: { unspent: async () => [] },
    } as unknown as Api;

    const summary = await scanForUtxos({ api, root, templates: [template], includeChange: false, gapLimit: 3, startOffset: 0, maxPerChain: 100 });
    expect(calls).toHaveLength(6);                  // 0..2 then 3 unused
    expect(summary.usedAddresses).toBe(2);
    expect(summary.hits).toHaveLength(1);
    expect(summary.hits[0].balance).toBe(7000);
    expect(summary.protectedTotal).toBe(1);        // the 1-sat output

    const failing = { ...api, ordinals: { unspent: async () => { throw new Error('503'); } } } as unknown as Api;
    await expect(scanForUtxos({ api: failing, root, templates: [template], includeChange: false, gapLimit: 3, startOffset: 0, maxPerChain: 100 }))
      .rejects.toThrow(/Refusing to build/);
  });
});
