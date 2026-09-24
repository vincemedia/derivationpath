import { useState } from 'react';
import { ArrowLeftRight, Clock3, RefreshCw } from 'lucide-react';
import { useApp } from '../state';
import { deriveKey, templateHasChain } from '../lib/derive';
import { clamp, safeInt } from '../lib/format';
import { Empty, SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';

interface Entry { txid: string; height: number; addresses: string[]; paths: string[] }

type Chains = 'both' | 'receive' | 'change';

export function HistoryPanel() {
  const { session, selection, api } = useApp();
  const [count, setCount] = useState('25');
  const [chains, setChains] = useState<Chains>('both');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const task = useTask('No history search has run.');
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
        task.setStatus(`Checking ${++step}/${steps}: ${key.path} — ${key.address}`);
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
    task.setStatus(`History search complete. ${sorted.length} unique transaction(s) across ${steps} address(es).`, sorted.length ? 'success' : 'warn');
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Transaction history" icon={Clock3}>Search activity across a window of addresses on the selected template ({selection.template}).</SectionTitle>
      <div className="grid-2">
        <div className="field"><label htmlFor="historyCount">Addresses per chain</label>
          <input id="historyCount" type="number" min={1} max={100} value={count} onChange={e => setCount(e.target.value)} /></div>
        <div className="field"><label htmlFor="historyChain">Chains</label>
          <select id="historyChain" value={hasChain ? chains : 'receive'} disabled={!hasChain} onChange={e => setChains(e.target.value as Chains)}>
            <option value="both">Receive and change</option><option value="receive">Receive only</option><option value="change">Change only</option>
          </select></div>
      </div>
      <div className="actions"><button className="btn btn-primary" disabled={task.busy || !session} onClick={load}><RefreshCw size={16} /> Load transaction history</button></div>
      <Status status={task.status} />
      {entries && (
        <div className="result-list">
          {entries.map(e => (
            <div className="result-item" key={e.txid}>
              <span className="chip" aria-hidden><ArrowLeftRight size={16} /></span>
              <div className="body">
              <h4>{e.height > 0 ? `Block ${e.height.toLocaleString('en-US')}` : 'Unconfirmed'}</h4>
              <p className="mono"><TxLink txid={e.txid} /></p>
              <p className="mono">{e.paths.map((p, i) => `${p} — ${e.addresses[i]}`).join(' · ')}</p>
              </div>
            </div>
          ))}
          {!entries.length && <Empty icon={Clock3}>No transaction activity found in the scanned window.</Empty>}
        </div>
      )}
    </div></div>
  );
}
