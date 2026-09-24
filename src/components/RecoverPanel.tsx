import { useEffect, useMemo, useRef, useState } from 'react';
import { WalletClient } from '@bsv/sdk';
import { AtSign, Loader2, PenLine, ScanSearch, SearchX, Send, Wallet, X } from 'lucide-react';
import { useApp } from '../state';
import { UNIQUE_TEMPLATES, isValidAddress, templateHasChain } from '../lib/derive';
import { scanForUtxos, type AddressHit } from '../lib/scan';
import { buildP2pkhTransaction, type BuiltTx } from '../lib/tx';
import { sweepToBrc100 } from '../lib/brc100';
import { shieldNote } from '../lib/tokens';
import { clamp, fmtSats, fmtUsd, safeInt } from '../lib/format';
import { Empty, SectionLabel, SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';

const brc100Wallet = new WalletClient();

type Scope = 'selected' | 'all';
type Destination = 'brc100' | 'address';

export function RecoverPanel() {
  const app = useApp();
  const { session, selection, api, settings, price } = app;
  const [scope, setScope] = useState<Scope>('selected');
  const [gapLimit, setGapLimit] = useState('20');
  const [startOffset, setStartOffset] = useState('0');
  const [maxPerChain, setMaxPerChain] = useState('1000');
  const [includeChange, setIncludeChange] = useState(true);
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<Destination>('brc100');
  const [destAddress, setDestAddress] = useState('');
  const [built, setBuilt] = useState<BuiltTx | null>(null);
  const [done, setDone] = useState<{ txid: string; hex: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scanTask = useTask('No recovery scan has run.');
  const sweepTask = useTask('');

  // Unmount (lock / clear wallet) must stop a scan that still holds the root key.
  useEffect(() => () => abortRef.current?.abort(), []);

  const templates = scope === 'all' ? UNIQUE_TEMPLATES : [selection.template];
  const chosen = useMemo(() => hits.filter(h => !excluded.has(h.address) && h.utxos.length), [hits, excluded]);
  const inputs = useMemo(() => chosen.flatMap(h => h.utxos), [chosen]);
  const chosenTotal = inputs.reduce((s, u) => s + u.satoshis, 0);

  const scan = () => scanTask.run(async () => {
    if (!session) throw new Error('Load a wallet first.');
    const controller = new AbortController();
    abortRef.current = controller;
    setHits([]);
    setExcluded(new Set());
    setBuilt(null);
    setDone(null);
    sweepTask.setStatus('');
    try {
      const summary = await scanForUtxos({
        api, root: session.root, templates, includeChange,
        gapLimit: clamp(safeInt(gapLimit, 20), 1, 200),
        startOffset: safeInt(startOffset),
        maxPerChain: clamp(safeInt(maxPerChain, 1000), 1, 10_000),
        signal: controller.signal,
        onProgress: m => scanTask.setStatus(m),
        onHit: hit => setHits(prev => [...prev, hit]),
      });
      const total = summary.hits.reduce((s, h) => s + h.balance, 0);
      const utxoCount = summary.hits.reduce((s, h) => s + h.utxos.length, 0);
      const capped = summary.cappedChains.length ? ` Stopped early at the per-chain cap on: ${summary.cappedChains.join(', ')} — raise the cap to keep looking.` : '';
      scanTask.setStatus(
        `Scan complete: checked ${summary.addressesChecked} address(es), ${summary.usedAddresses} with history. Found ${utxoCount} spendable UTXO(s), ${fmtSats(total)} sats (${fmtUsd(total, price)}).${shieldNote(summary.protectedTotal)}${capped}`,
        utxoCount ? 'success' : 'warn');
    } finally {
      abortRef.current = null;
    }
  });

  const toggle = (address: string) => {
    setBuilt(null);
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address); else next.add(address);
      return next;
    });
  };

  const afterSweep = (txid: string, hex: string, message: string) => {
    // Clear results so the same coins can't be swept twice.
    setHits([]);
    setExcluded(new Set());
    setBuilt(null);
    setDone({ txid, hex });
    sweepTask.setStatus(message, 'success');
  };

  const sweepBrc100 = () => sweepTask.run(async () => {
    if (!inputs.length) throw new Error('No UTXOs selected.');
    if (!(await app.confirm('Sweep into your local wallet?', `This spends ${inputs.length} UTXO(s) worth ${fmtSats(chosenTotal)} sats into your BRC-100 wallet and broadcasts immediately. It is irreversible.`))) return;
    const { txid, hex } = await sweepToBrc100({ api, wallet: brc100Wallet, inputs, onProgress: m => sweepTask.setStatus(m) });
    afterSweep(txid, hex, `Swept into your BRC-100 wallet. TXID: ${txid}`);
  });

  const buildToAddress = () => sweepTask.run(async () => {
    setBuilt(null);
    if (!inputs.length) throw new Error('No UTXOs selected.');
    const dest = destAddress.trim();
    if (!isValidAddress(dest)) throw new Error('Recovery destination is invalid.');
    const tx = await buildP2pkhTransaction({
      api, inputs, outputs: [], changeAddress: dest, feePerKb: settings.feePerKb,
      onProgress: m => sweepTask.setStatus(m),
    });
    setBuilt(tx);
    sweepTask.setStatus(
      `Consolidation signed: ${inputs.length} UTXO(s), ${fmtSats(tx.totalIn)} sats in, fee ${fmtSats(tx.fee)} sats, ${fmtSats(tx.totalOut)} sats to ${dest}. Review before broadcasting.`,
      'success');
  });

  const broadcastToAddress = () => sweepTask.run(async () => {
    if (!built) throw new Error('Build the recovery transaction first.');
    if (!(await app.confirm('Broadcast recovery?', `This is irreversible. It spends ${inputs.length} UTXO(s) and sends ${fmtSats(built.totalOut)} sats to ${destAddress.trim()}.`))) return;
    sweepTask.setStatus('Broadcasting…', 'warn');
    const txid = await api.woc.broadcast(built.hex);
    afterSweep(txid, built.hex, `Recovery broadcast accepted. TXID: ${txid}`);
  });

  const busy = scanTask.busy || sweepTask.busy;

  const hasFunds = inputs.length > 0 && !scanTask.busy;
  const totalBalance = hits.reduce((s, h) => s + h.balance, 0);
  const totalUtxos = hits.reduce((s, h) => s + h.utxos.length, 0);
  const totalProtected = hits.reduce((s, h) => s + h.protectedCount, 0);

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Discover & recover" icon={ScanSearch}>Walk receive and change chains with a gap limit, find spendable UTXOs, and sweep them into a BRC-100 wallet or to any address.</SectionTitle>

      <SectionLabel>Scan options</SectionLabel>
      <div className="grid-2">
        <div className="field full">
          <label htmlFor="scanScope">Paths to scan</label>
          <select id="scanScope" value={scope} onChange={e => setScope(e.target.value as Scope)}>
            <option value="selected">Selected template — {selection.template}</option>
            <option value="all">Every known wallet preset ({UNIQUE_TEMPLATES.length} templates)</option>
          </select>
          <div className="hint">Not sure which wallet made the phrase? Scan every preset — slower, but it finds funds on any of them.</div>
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="gapLimit">Gap limit</label>
          <input id="gapLimit" type="number" min={1} max={200} value={gapLimit} onChange={e => setGapLimit(e.target.value)} />
          <div className="hint">Consecutive unused addresses before a chain stops.</div></div>
        <div className="field"><label htmlFor="startOffset">Start offset</label>
          <input id="startOffset" type="number" min={0} value={startOffset} onChange={e => setStartOffset(e.target.value)} /></div>
        <div className="field"><label htmlFor="maxPerChain">Max per chain</label>
          <input id="maxPerChain" type="number" min={1} max={10000} value={maxPerChain} onChange={e => setMaxPerChain(e.target.value)} /></div>
      </div>
      <label className="toggle" style={{ marginTop: 16 }}><input type="checkbox" checked={includeChange} onChange={e => setIncludeChange(e.target.checked)}
        disabled={scope === 'selected' && !templateHasChain(selection.template)} /> Include change/internal chain</label>

      <div className="actions">
        <button className={`btn ${hasFunds ? 'btn-secondary' : 'btn-primary'}`} disabled={busy || !session} onClick={scan}>
          {scanTask.busy ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />} {hits.length ? 'Scan again' : 'Scan for UTXOs'}
        </button>
        {scanTask.busy && <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}><X size={16} /> Cancel</button>}
      </div>
      <Status status={scanTask.status} />

      {hits.length > 0 && (
        <>
          <SectionLabel>Funded addresses</SectionLabel>
          <div className="table-wrap">
            <table className="utxo-table">
              <thead><tr><th aria-label="Include" /><th>Path</th><th>Address</th><th className="num">Balance (sat)</th><th className="num">UTXOs</th><th className="num" title="Ordinal/token UTXOs left untouched">Protected</th></tr></thead>
              <tbody>
                {hits.map(h => (
                  <tr key={h.address} className={h.utxos.length ? '' : 'muted'}>
                    <td><input type="checkbox" aria-label={`Include ${h.address}`} disabled={!h.utxos.length || busy}
                      checked={!!h.utxos.length && !excluded.has(h.address)} onChange={() => toggle(h.address)} /></td>
                    <td className="mono">{h.path}</td>
                    <td className="mono">{h.address}</td>
                    <td className="num">{fmtSats(h.balance)}</td>
                    <td className="num">{h.utxos.length}</td>
                    <td className="num">{h.protectedCount || '–'}</td>
                  </tr>
                ))}
              </tbody>
              {hits.length > 1 && (
                <tfoot><tr><td /><td colSpan={2}>Total</td><td className="num">{fmtSats(totalBalance)}</td><td className="num">{totalUtxos}</td><td className="num">{totalProtected || '–'}</td></tr></tfoot>
              )}
            </table>
          </div>
        </>
      )}
      {!scanTask.busy && hits.length === 0 && scanTask.status.type === 'warn' && <div className="result-list"><Empty icon={SearchX}>No spendable UTXOs found in the scanned window.</Empty></div>}

      {hasFunds && (
        <div className="sweep-box">
          <div className="label-caps">Ready to sweep</div>
          <div className="sweep-total">{fmtSats(chosenTotal)} <small>sats · {fmtUsd(chosenTotal, price)} · {inputs.length} UTXO(s)</small></div>
          <div className="segmented" role="radiogroup" aria-label="Sweep destination" style={{ marginTop: 14 }}>
            <label className={destination === 'brc100' ? 'on' : ''}><input type="radio" name="dest" checked={destination === 'brc100'} onChange={() => { setDestination('brc100'); setBuilt(null); }} /><Wallet size={15} /> BRC-100 wallet</label>
            <label className={destination === 'address' ? 'on' : ''}><input type="radio" name="dest" checked={destination === 'address'} onChange={() => setDestination('address')} /><AtSign size={15} /> Any BSV address</label>
          </div>

          {destination === 'brc100' ? (
            <>
              <p className="mini" style={{ marginTop: 14 }}>Your BRC-100 wallet (e.g. Metanet Desktop) assigns the outputs and picks the fee. Each input is signed here with SIGHASH_ALL so the wallet cannot change the transaction, then the wallet broadcasts it.</p>
              <div className="actions"><button className="btn btn-primary" disabled={busy} onClick={sweepBrc100}><Wallet size={16} /> Sweep into my local wallet</button></div>
            </>
          ) : (
            <>
              <div className="field" style={{ marginTop: 14 }}><label htmlFor="recoveryDestination">Destination address</label>
                <input id="recoveryDestination" spellCheck={false} value={destAddress} onChange={e => { setDestAddress(e.target.value); setBuilt(null); }} placeholder="BSV address to receive everything" /></div>
              <div className="actions">
                <button className={`btn ${built ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={buildToAddress}><PenLine size={16} /> Build transaction</button>
                <button className="btn btn-ink" disabled={busy || !built} onClick={broadcastToAddress}><Send size={16} /> Broadcast</button>
              </div>
              {built && <div className="field" style={{ marginTop: 16 }}><label htmlFor="recoveryRaw">Signed transaction · <span className="mono muted">{built.txid}</span></label><textarea id="recoveryRaw" className="mono" readOnly value={built.hex} /></div>}
            </>
          )}
        </div>
      )}
      {(sweepTask.status.text || done) && <Status status={sweepTask.status} />}
      {done && (
        <div className="tx-result">
          <TxLink txid={done.txid} label="View on WhatsOnChain ↗" />
          <pre className="tx-hex">{done.hex}</pre>
        </div>
      )}
    </div></div>
  );
}
