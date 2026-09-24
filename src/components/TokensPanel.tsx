import { useEffect, useState } from 'react';
import { Coins, Gem, RefreshCw } from 'lucide-react';
import { useApp } from '../state';
import { describeOrdinal, isProtectedTxo, type OrdinalSummary } from '../lib/tokens';
import type { Bsv20Balance } from '../lib/net';
import { fmtSats, safeInt } from '../lib/format';
import { Empty, SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';

function tokenAmount(b: Bsv20Balance): string {
  const decimals = safeInt(b.dec, 0);
  const raw = Number(b.all?.confirmed ?? b.confirmed ?? 0);
  return decimals ? (raw / 10 ** decimals).toFixed(decimals) : String(raw);
}

export function TokensPanel() {
  const { selected, api } = useApp();
  const [ordinals, setOrdinals] = useState<OrdinalSummary[] | null>(null);
  const [balances, setBalances] = useState<Bsv20Balance[]>([]);
  const task = useTask('No token lookup has run.');

  const address = selected?.address ?? '';
  useEffect(() => {
    setOrdinals(null);
    setBalances([]);
  }, [address]);

  const load = () => task.run(async () => {
    if (!selected) throw new Error('Load a wallet first.');
    task.setStatus('Querying the 1Sat overlay…');
    const [txos, bsv20] = await Promise.all([
      api.ordinals.unspent(selected.address),
      api.ordinals.bsv20Balance(selected.address).catch(() => [] as Bsv20Balance[]),
    ]);
    const found = txos.filter(isProtectedTxo).map(describeOrdinal);
    const list = Array.isArray(bsv20) ? bsv20 : [];
    setOrdinals(found);
    setBalances(list);
    const count = found.length + list.length;
    task.setStatus(
      count ? `Found ${found.length} ordinal/token output(s) and ${list.length} BSV-20 balance(s) at ${selected.address}. These are excluded from every spend.`
        : `No ordinals or BSV-20 tokens found at ${selected.address}.`,
      count ? 'success' : '');
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Tokens & ordinals" icon={Gem}>Read-only view of 1Sat ordinals and BSV-20 balances at the selected address.</SectionTitle>
      <p className="mini">These UTXOs are automatically excluded from every Send and Recovery transaction so they can never be burned as plain satoshis. Transferring them is not supported here — use a dedicated ordinals wallet.</p>
      <div className="actions"><button className="btn btn-primary" disabled={task.busy || !selected} onClick={load}><RefreshCw size={16} /> Load tokens & ordinals</button></div>
      <Status status={task.status} />
      {ordinals && (
        <div className="result-list">
          {ordinals.map(o => (
            <div className="result-item protected" key={o.outpoint}>
              <span className="chip" aria-hidden><Gem size={16} /></span>
              <div className="body">
              <h4>{o.name || `${o.kind}${o.num ? ` #${o.num}` : ''}`}</h4>
              {o.app && <p>App: {o.app}</p>}
              {o.type && <p>File: {o.type}{o.size ? ` · ${fmtSats(o.size)} bytes` : ''}</p>}
              <p className="mono">{o.outpoint} · {fmtSats(o.satoshis)} sat(s)</p>
              </div>
            </div>
          ))}
          {balances.map((b, i) => (
            <div className="result-item protected" key={b.id || b.tick || i}>
              <span className="chip" aria-hidden><Coins size={16} /></span>
              <div className="body">
                <h4 className="tnum">{tokenAmount(b)} {b.sym || b.tick || 'BSV-20'}</h4>
                <p className="mono">{b.id ? `ID: ${b.id}` : 'BSV-20 balance'}</p>
              </div>
            </div>
          ))}
          {!ordinals.length && !balances.length && <Empty icon={Gem}>No ordinals or BSV-20 balances at this address.</Empty>}
        </div>
      )}
    </div></div>
  );
}
