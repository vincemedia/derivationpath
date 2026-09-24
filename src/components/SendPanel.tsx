import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy, ExternalLink, PenLine, Send } from 'lucide-react';
import { useApp } from '../state';
import { isValidAddress } from '../lib/derive';
import { filterSpendable, protectedSet, shieldNote } from '../lib/tokens';
import { buildP2pkhTransaction, type BuiltTx } from '../lib/tx';
import { fmtSats, safeInt } from '../lib/format';
import { SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';

export function SendPanel() {
  const app = useApp();
  const { selected, settings, api } = app;
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sendAll, setSendAll] = useState(false);
  const [built, setBuilt] = useState<BuiltTx | null>(null);
  const [broadcastTxid, setBroadcastTxid] = useState('');
  const task = useTask('No transaction built.');

  // A built tx belongs to one source address; switching address discards it.
  const from = selected?.address ?? '';
  useEffect(() => {
    setBuilt(null);
    setBroadcastTxid('');
  }, [from]);

  const build = () => task.run(async () => {
    setBuilt(null);
    setBroadcastTxid('');
    if (!selected) throw new Error('Load a wallet first.');
    const recipient = to.trim();
    if (!isValidAddress(recipient)) throw new Error('Recipient address is invalid.');
    const sats = safeInt(amount, -1);
    if (!sendAll && sats <= 0) throw new Error('Amount must be at least 1 satoshi.');

    task.setStatus('Checking UTXOs against the ordinal/token indexer…');
    const [raw, shield] = await Promise.all([api.woc.unspent(selected.address), protectedSet(api, selected.address)]);
    const { spendable, protectedCount } = filterSpendable(
      raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value })), shield);
    if (!spendable.length) {
      throw new Error(protectedCount
        ? `Every UTXO on this address holds an ordinal or token (${protectedCount}). There are no plain satoshis here to spend.`
        : 'No spendable UTXOs were found on the selected address.');
    }
    const total = spendable.reduce((s, u) => s + u.satoshis, 0);
    if (!sendAll && sats >= total) throw new Error(`Amount exceeds spendable value (${fmtSats(total)} sats) once the miner fee is accounted for.`);

    const tx = await buildP2pkhTransaction({
      api,
      inputs: spendable.map(u => ({ ...u, address: selected.address, privateKey: selected.privateKey })),
      outputs: sendAll ? [] : [{ address: recipient, satoshis: sats }],
      changeAddress: sendAll ? recipient : selected.address,
      feePerKb: settings.feePerKb,
      onProgress: m => task.setStatus(m),
    });
    setBuilt(tx);
    const sent = sendAll ? tx.totalOut : sats;
    task.setStatus(
      `Signed. Sending ${fmtSats(sent)} sats from ${spendable.length} input(s); fee ${fmtSats(tx.fee)} sats (${tx.size} bytes).${shieldNote(protectedCount)} Review the raw transaction before broadcasting.`,
      'success');
  });

  const broadcast = () => task.run(async () => {
    if (!built) throw new Error('Build a transaction first.');
    const sent = sendAll ? built.totalOut : safeInt(amount);
    if (!(await app.confirm('Broadcast transaction?', `This is irreversible. Sending ${fmtSats(sent)} sats to ${to.trim()} with a ${fmtSats(built.fee)}-sat fee.`))) return;
    task.setStatus('Broadcasting…', 'warn');
    const txid = await api.woc.broadcast(built.hex);
    setBroadcastTxid(txid);
    setBuilt(null);
    task.setStatus(`Broadcast accepted. TXID: ${txid}`, 'success');
    void app.refreshBalance();
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Build and send" icon={ArrowUpRight}>Create a signed P2PKH transaction from the currently selected address.</SectionTitle>
      <div className="grid-2">
        <div className="field full"><label htmlFor="sendFrom">From</label><input id="sendFrom" readOnly value={from} placeholder="Load a wallet first" /></div>
        <div className="field full"><label htmlFor="sendTo">Recipient address</label><input id="sendTo" autoComplete="off" spellCheck={false} value={to} onChange={e => setTo(e.target.value)} placeholder="BSV address" /></div>
        <div className="field"><label htmlFor="sendAmount">Amount (satoshis)</label>
          <input id="sendAmount" type="number" min={1} step={1} value={sendAll ? '' : amount} disabled={sendAll} onChange={e => setAmount(e.target.value)} placeholder={sendAll ? 'Entire balance minus fee' : '1000'} /></div>
        <div className="field"><label>Fee rate</label><input readOnly value={`${settings.feePerKb} sats/KB`} /><div className="hint">Change it in Settings.</div></div>
      </div>
      <label className="toggle" style={{ marginTop: 15 }}><input type="checkbox" checked={sendAll} onChange={e => setSendAll(e.target.checked)} /> Send entire spendable balance (no change output)</label>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy || !selected} onClick={build}><PenLine size={16} /> Build signed transaction</button>
        <button className="btn btn-ink" disabled={task.busy || !built} onClick={broadcast}><Send size={16} /> Broadcast</button>
      </div>
      <Status status={task.status} />
      {broadcastTxid && <p className="mini">View on explorer: <TxLink txid={broadcastTxid} /></p>}
      {built && (
        <div className="field" style={{ marginTop: 15 }}>
          <label htmlFor="rawTx">Signed raw transaction · {built.txid}</label>
          <textarea id="rawTx" readOnly value={built.hex} />
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => task.run(async () => {
              await navigator.clipboard.writeText(built.hex);
              task.setStatus('Raw transaction copied.', 'success');
            })}><Copy size={16} /> Copy raw transaction</button>
            <a className="btn btn-secondary" href="https://whatsonchain.com/broadcast" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Decode on WhatsOnChain</a>
          </div>
        </div>
      )}
    </div></div>
  );
}
