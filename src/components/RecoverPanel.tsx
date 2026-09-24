import { useEffect, useMemo, useRef, useState } from 'react';
import { WalletClient } from '@bsv/sdk';
import { AtSign, Layers, Loader2, PenLine, ScanSearch, SearchX, Send, Wallet, X } from 'lucide-react';
import { useApp } from '../state';
import { UNIQUE_TEMPLATES, isValidAddress, presetById, templateHasChain } from '../lib/derive';
import { scanForUtxos, type AddressHit } from '../lib/scan';
import { buildP2pkhTransaction, type BuiltTx } from '../lib/tx';
import { sweepToBrc100 } from '../lib/brc100';
import { shieldNote } from '../lib/tokens';
import { clamp, fmtSats, fmtUsd, safeInt } from '../lib/format';
import { Empty, SectionLabel, SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';
import { LabelWithInfo } from './InfoTip';
import { OptionIcon, Select } from './Select';
import { WalletIcon } from './PresetPicker';

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
      const capped = summary.cappedChains.length ? ` Stopped at the address limit on ${summary.cappedChains.join(', ')}. Raise "Max addresses per list" to keep looking.` : '';
      scanTask.setStatus(
        `Done. Checked ${summary.addressesChecked} address(es), ${summary.usedAddresses} used before. Found ${fmtSats(total)} sats (${fmtUsd(total, price)}) in ${utxoCount} coin(s).${shieldNote(summary.protectedTotal)}${capped}`,
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
    if (!inputs.length) throw new Error('Select at least one address to move.');
    if (!(await app.confirm('Move to your wallet?', `This moves ${fmtSats(chosenTotal)} sats into your BRC-100 wallet right away. It can't be undone.`))) return;
    const { txid, hex } = await sweepToBrc100({ api, wallet: brc100Wallet, inputs, onProgress: m => sweepTask.setStatus(m) });
    afterSweep(txid, hex, `Done! Your coins are on their way to your BRC-100 wallet. Transaction ID: ${txid}`);
  });

  const buildToAddress = () => sweepTask.run(async () => {
    setBuilt(null);
    if (!inputs.length) throw new Error('Select at least one address to move.');
    const dest = destAddress.trim();
    if (!isValidAddress(dest)) throw new Error("That destination address isn't valid.");
    const tx = await buildP2pkhTransaction({
      api, inputs, outputs: [], changeAddress: dest, feePerKb: settings.feePerKb,
      onProgress: m => sweepTask.setStatus(m),
    });
    setBuilt(tx);
    sweepTask.setStatus(
      `Ready. ${fmtSats(tx.totalOut)} sats will arrive at ${dest} after a ${fmtSats(tx.fee)}-sat fee. Check it, then press Send now.`,
      'success');
  });

  const broadcastToAddress = () => sweepTask.run(async () => {
    if (!built) throw new Error('Prepare the transaction first.');
    if (!(await app.confirm('Send now?', `This can't be undone. ${fmtSats(built.totalOut)} sats will go to ${destAddress.trim()}.`))) return;
    sweepTask.setStatus('Sending…', 'warn');
    const txid = await api.woc.broadcast(built.hex);
    afterSweep(txid, built.hex, `Sent! Transaction ID: ${txid}`);
  });

  const busy = scanTask.busy || sweepTask.busy;

  const hasFunds = inputs.length > 0 && !scanTask.busy;
  const totalBalance = hits.reduce((s, h) => s + h.balance, 0);
  const totalUtxos = hits.reduce((s, h) => s + h.utxos.length, 0);
  const totalProtected = hits.reduce((s, h) => s + h.protectedCount, 0);

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Find & recover" icon={ScanSearch}>We check your addresses one by one for coins, then move everything we find to your BRC-100 wallet or any address.</SectionTitle>

      <SectionLabel>Scan options</SectionLabel>
      <div className="grid-2">
        <div className="field full">
          <LabelWithInfo htmlFor="scanScope" label="Paths to scan" info="Which recipe to use to find your addresses. &quot;Your selected path&quot; checks only the one from the Wallet tab. &quot;Every wallet we know&quot; tries them all: slower, but handy if you&apos;re not sure which app you used." />
          <Select id="scanScope" value={scope} onChange={setScope} options={[
            { value: 'selected', prefix: presetById(selection.presetId)?.name ?? 'Custom', label: 'Your selected path', detail: selection.template, icon: <WalletIcon preset={presetById(selection.presetId)} /> },
            { value: 'all', label: 'Every wallet we know', detail: `${UNIQUE_TEMPLATES.length} paths, slower`, icon: <OptionIcon><Layers size={13} /></OptionIcon> },
          ]} />
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 16 }}>
        <div className="field"><LabelWithInfo htmlFor="gapLimit" label="Gap limit" info="Wallets use addresses in order. We keep checking until we find this many unused addresses in a row, then assume there are no more. Raise it if you think coins are further along." />
          <input id="gapLimit" type="number" min={1} max={200} value={gapLimit} onChange={e => setGapLimit(e.target.value)} />
          <div className="hint">Stop after this many empty addresses in a row.</div></div>
        <div className="field"><LabelWithInfo htmlFor="startOffset" label="Start at address #" info="Where to start counting. Leave it at 0 unless you know your coins are further down the list." />
          <input id="startOffset" type="number" min={0} value={startOffset} onChange={e => setStartOffset(e.target.value)} /></div>
        <div className="field"><LabelWithInfo htmlFor="maxPerChain" label="Max addresses per list" info="A safety limit so a scan can&apos;t run forever. Each list (receive and change) stops here, even if it keeps finding used addresses." />
          <input id="maxPerChain" type="number" min={1} max={10000} value={maxPerChain} onChange={e => setMaxPerChain(e.target.value)} /></div>
      </div>
      <label className="toggle" style={{ marginTop: 16 }}><input type="checkbox" checked={includeChange} onChange={e => setIncludeChange(e.target.checked)}
        disabled={scope === 'selected' && !templateHasChain(selection.template)} /> Also check change addresses</label>

      <div className="actions">
        <button className={`btn ${hasFunds ? 'btn-secondary' : 'btn-primary'}`} disabled={busy || !session} onClick={scan}>
          {scanTask.busy ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />} {hits.length ? 'Scan again' : 'Scan for coins'}
        </button>
        {scanTask.busy && <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}><X size={16} /> Cancel</button>}
      </div>
      <Status status={scanTask.status} />

      {hits.length > 0 && (
        <>
          <SectionLabel>Funded addresses</SectionLabel>
          <div className="table-wrap">
            <table className="utxo-table">
              <thead><tr><th aria-label="Include" /><th>Path</th><th>Address</th><th className="num">Sats</th><th className="num">Coins</th><th className="num" title="Coins holding NFTs or tokens. We leave these alone so they stay safe.">NFTs/tokens</th></tr></thead>
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
      {!scanTask.busy && hits.length === 0 && scanTask.status.type === 'warn' && <div className="result-list"><Empty icon={SearchX}>No coins found at the addresses we checked.</Empty></div>}

      {hasFunds && (
        <div className="sweep-box">
          <div className="label-caps">Ready to move</div>
          <div className="sweep-total">{fmtSats(chosenTotal)} <small>sats · {fmtUsd(chosenTotal, price)} · {inputs.length} coin(s)</small></div>
          <div className="segmented" role="radiogroup" aria-label="Sweep destination" style={{ marginTop: 14 }}>
            <label className={destination === 'brc100' ? 'on' : ''}><input type="radio" name="dest" checked={destination === 'brc100'} onChange={() => { setDestination('brc100'); setBuilt(null); }} /><Wallet size={15} /> BRC-100 wallet</label>
            <label className={destination === 'address' ? 'on' : ''}><input type="radio" name="dest" checked={destination === 'address'} onChange={() => setDestination('address')} /><AtSign size={15} /> Any BSV address</label>
          </div>

          {destination === 'brc100' ? (
            <>
              <p className="mini" style={{ marginTop: 14 }}>Your BRC-100 wallet (like Metanet Desktop) needs to be open. It receives the coins and pays the fee. We sign everything here, so the wallet can't change where the money goes.</p>
              <div className="actions"><button className="btn btn-primary" disabled={busy} onClick={sweepBrc100}><Wallet size={16} /> Move to my wallet</button></div>
            </>
          ) : (
            <>
              <div className="field" style={{ marginTop: 14 }}><LabelWithInfo htmlFor="recoveryDestination" label="Destination address" info="The BSV address that receives everything we found, minus a small network fee. Double-check it: once sent, it can&apos;t be undone." />
                <input id="recoveryDestination" spellCheck={false} value={destAddress} onChange={e => { setDestAddress(e.target.value); setBuilt(null); }} placeholder="The BSV address that gets everything" /></div>
              <div className="actions">
                <button className={`btn ${built ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={buildToAddress}><PenLine size={16} /> Prepare transaction</button>
                <button className="btn btn-ink" disabled={busy || !built} onClick={broadcastToAddress}><Send size={16} /> Send now</button>
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
