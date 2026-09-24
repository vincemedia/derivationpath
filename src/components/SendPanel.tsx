import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy, ExternalLink, PenLine, Send } from 'lucide-react';
import { useApp } from '../state';
import { isValidAddress } from '../lib/derive';
import { filterSpendable, protectedSet, shieldNote } from '../lib/tokens';
import { buildP2pkhTransaction, type BuiltTx } from '../lib/tx';
import { fmtSats, safeInt } from '../lib/format';
import { SectionTitle, Status, TxLink } from './ui';
import { useTask } from '../hooks/useTask';
import { LabelWithInfo } from './InfoTip';

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
    if (!isValidAddress(recipient)) throw new Error("That recipient address isn't valid.");
    const sats = safeInt(amount, -1);
    if (!sendAll && sats <= 0) throw new Error('Enter an amount of at least 1 sat.');

    task.setStatus('Checking this address for NFTs and tokens so they stay safe…');
    const [raw, shield] = await Promise.all([api.woc.unspent(selected.address), protectedSet(api, selected.address)]);
    const { spendable, protectedCount } = filterSpendable(
      raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value })), shield);
    if (!spendable.length) {
      throw new Error(protectedCount
        ? `All ${protectedCount} coin(s) at this address hold NFTs or tokens, so there's nothing here you can spend.`
        : 'This address has no coins to spend.');
    }
    const total = spendable.reduce((s, u) => s + u.satoshis, 0);
    if (!sendAll && sats >= total) throw new Error(`That's more than this address holds (${fmtSats(total)} sats) once the network fee is taken out.`);

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
      `Ready. Sending ${fmtSats(sent)} sats with a ${fmtSats(tx.fee)}-sat fee.${shieldNote(protectedCount)} Check the details, then press Send now.`,
      'success');
  });

  const broadcast = () => task.run(async () => {
    if (!built) throw new Error('Prepare the transaction first.');
    const sent = sendAll ? built.totalOut : safeInt(amount);
    if (!(await app.confirm('Send now?', `This can't be undone. ${fmtSats(sent)} sats will go to ${to.trim()}, plus a ${fmtSats(built.fee)}-sat fee.`))) return;
    task.setStatus('Sending…', 'warn');
    const txid = await api.woc.broadcast(built.hex);
    setBroadcastTxid(txid);
    setBuilt(null);
    task.setStatus(`Sent! Transaction ID: ${txid}`, 'success');
    void app.refreshBalance();
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Build and send" icon={ArrowUpRight}>Send BSV from the address selected on the Wallet tab. You'll check it before it goes out.</SectionTitle>
      <div className="grid-2">
        <div className="field full"><LabelWithInfo htmlFor="sendFrom" label="From" info="The address the money comes from: the one selected on the Wallet tab. To send from another address, change the address index there." /><input id="sendFrom" readOnly value={from} placeholder="Load a wallet first" /></div>
        <div className="field full"><LabelWithInfo htmlFor="sendTo" label="Recipient address" info="Where the money goes. Paste the full BSV address (it usually starts with a 1) and check the first and last few characters. A payment to the wrong address can&apos;t be undone." /><input id="sendTo" autoComplete="off" spellCheck={false} value={to} onChange={e => setTo(e.target.value)} placeholder="BSV address" /></div>
        <div className="field"><LabelWithInfo htmlFor="sendAmount" label="Amount (sats)" info="How much to send, in sats. 1 BSV is 100,000,000 sats. The network fee is paid on top, from this same address." />
          <input id="sendAmount" type="number" min={1} step={1} value={sendAll ? '' : amount} disabled={sendAll} onChange={e => setAmount(e.target.value)} placeholder={sendAll ? 'Everything, minus the fee' : '1000'} />
          <div className="hint">1 BSV = 100,000,000 sats.</div></div>
        <div className="field"><LabelWithInfo htmlFor="sendFee" label="Network fee" info="A small payment to the miners who add your transaction to the blockchain. It depends on the transaction&apos;s size and is usually just a few sats. Change the rate in Settings." /><input id="sendFee" readOnly value={`${settings.feePerKb} sats/KB`} /><div className="hint">Change it in Settings.</div></div>
      </div>
      <label className="toggle" style={{ marginTop: 15 }}><input type="checkbox" checked={sendAll} onChange={e => setSendAll(e.target.checked)} /> Send everything at this address</label>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy || !selected} onClick={build}><PenLine size={16} /> Prepare transaction</button>
        <button className="btn btn-ink" disabled={task.busy || !built} onClick={broadcast}><Send size={16} /> Send now</button>
      </div>
      <Status status={task.status} />
      {broadcastTxid && <p className="mini">View it on the blockchain: <TxLink txid={broadcastTxid} /></p>}
      {built && (
        <div className="field" style={{ marginTop: 15 }}>
          <label htmlFor="rawTx">Signed transaction · {built.txid}</label>
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
