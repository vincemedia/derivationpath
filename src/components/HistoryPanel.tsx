import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, Clock3, RefreshCw, Repeat2 } from 'lucide-react';
import { useApp } from '../state';
import { deriveKey, templateHasChain } from '../lib/derive';
import { clamp, safeInt } from '../lib/format';
import { Empty, SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';
import { LabelWithInfo } from './InfoTip';
import { OptionIcon, Select } from './Select';

interface Entry { txid: string; height: number; addresses: string[]; paths: string[] }

type Chains = 'both' | 'receive' | 'change';

export function HistoryPanel() {
  const { session, selection, api } = useApp();
  const [count, setCount] = useState('25');
  const [chains, setChains] = useState<Chains>('both');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const task = useTask('Nothing loaded yet.');
  const hasChain = templateHasChain(selection.template);

  const load = () => task.run(async () => {
    if (!session) throw new Error('Load a wallet first.');
    const n = clamp(safeInt(count, 25), 1, 100);
    const chainList = !hasChain ? [0] : chains === 'both' ? [0, 1] : [chains === 'change' ? 1 : 0];
    const byTxid = new Map<string, Entry>();
    const steps = n * chainList.length;
    let step = 0;
    setEntries(null);
    for (const chain of chainList) {
      for (let index = 0; index < n; index++) {
        const key = deriveKey(session.root, selection.template, chain, index);
        task.setStatus(`Checking ${++step}/${steps}: ${key.path}: ${key.address}`);
        for (const row of await api.woc.history(key.address)) {
          const entry = byTxid.get(row.tx_hash) ?? { txid: row.tx_hash, height: Number(row.height ?? 0), addresses: [], paths: [] };
          if (!entry.addresses.includes(key.address)) {
            entry.addresses.push(key.address);
            entry.paths.push(key.path);
          }
          byTxid.set(row.tx_hash, entry);
        }
      }
    }
    // Unconfirmed (height <= 0) first, then newest block first.
    const sorted = [...byTxid.values()].sort((a, b) => {
      const ha = a.height > 0 ? a.height : Infinity;
      const hb = b.height > 0 ? b.height : Infinity;
      return hb - ha;
    });
    setEntries(sorted);
    task.setStatus(`Found ${sorted.length} transaction(s) across ${steps} address(es).`, sorted.length ? 'success' : 'warn');
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Transaction history" icon={Clock3}>See past transactions for the first addresses on your selected path ({selection.template}).</SectionTitle>
      <div className="grid-2">
        <div className="field"><LabelWithInfo htmlFor="historyCount" label="Addresses to check per list" info="How many addresses to look at, starting from #0. More finds older activity but takes longer (we check about 3 per second)." />
          <input id="historyCount" type="number" min={1} max={100} value={count} onChange={e => setCount(e.target.value)} /></div>
        <div className="field"><LabelWithInfo htmlFor="historyChain" label="Lists" info="Receive addresses are the ones you gave out to get paid. Change addresses hold leftovers your wallet sent back to itself. Check both to see everything." />
          <Select id="historyChain" value={hasChain ? chains : 'receive'} disabled={!hasChain} onChange={setChains} options={[
            { value: 'both', label: 'Receive and change', icon: <OptionIcon><ArrowLeftRight size={13} /></OptionIcon> },
            { value: 'receive', label: 'Receive only', icon: <OptionIcon><ArrowDownLeft size={13} /></OptionIcon> },
            { value: 'change', label: 'Change only', icon: <OptionIcon><Repeat2 size={13} /></OptionIcon> },
          ]} /></div>
      </div>
      <div className="actions"><button className="btn btn-primary" disabled={task.busy || !session} onClick={load}><RefreshCw size={16} /> Load history</button></div>
      <Status status={task.status} />
      {entries && (
        <div className="result-list">
          {entries.map(e => (
            <div className="result-item" key={e.txid}>
              <span className="chip" aria-hidden><ArrowLeftRight size={16} /></span>
              <div className="body">
              <h4>{e.height > 0 ? `Block ${e.height.toLocaleString('en-US')}` : 'Unconfirmed'}</h4>
              <p className="mono"><TxLink txid={e.txid} /></p>
              <p className="mono">{e.paths.map((p, i) => `${p}: ${e.addresses[i]}`).join(' · ')}</p>
              </div>
            </div>
          ))}
          {!entries.length && <Empty icon={Clock3}>No transactions found at the addresses we checked.</Empty>}
        </div>
      )}
    </div></div>
  );
}
