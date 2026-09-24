import { useState } from 'react';
import { Activity, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../state';
import { DEFAULT_SETTINGS, MAX_FEE_PER_KB, isHttps, sanitizeFee } from '../lib/settings';
import { createApi } from '../lib/net';
import { fmtSats } from '../lib/format';
import { SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';
import { LabelWithInfo } from './InfoTip';

export function SettingsPanel() {
  const app = useApp();
  const [apiBase, setApiBase] = useState(app.settings.apiBase);
  const [explorerBase, setExplorerBase] = useState(app.settings.explorerBase);
  const [feePerKb, setFeePerKb] = useState(String(app.settings.feePerKb));
  const task = useTask('Using the default settings.');

  const save = () => task.run(async () => {
    const api = apiBase.trim().replace(/\/$/, '');
    const explorer = explorerBase.trim();
    if (!isHttps(api)) throw new Error('The data address must start with https://.');
    if (!isHttps(explorer)) throw new Error('The transaction link must start with https://.');
    const fee = sanitizeFee(feePerKb);
    app.updateSettings({ apiBase: api, explorerBase: explorer, feePerKb: fee });
    setApiBase(api);
    setFeePerKb(String(fee));
    const asked = Number.parseInt(feePerKb.trim(), 10);
    if (!Number.isInteger(asked) || asked !== fee) {
      throw new Error(`The fee must be a whole number from 1 to ${fmtSats(MAX_FEE_PER_KB)}, so we saved ${fmtSats(fee)}. Everything else was saved.`);
    }
    task.setStatus(`Saved. Network fee: ${fmtSats(fee)} sats per KB.`, 'success');
  });

  const reset = () => task.run(async () => {
    app.updateSettings({ ...DEFAULT_SETTINGS });
    setApiBase(DEFAULT_SETTINGS.apiBase);
    setExplorerBase(DEFAULT_SETTINGS.explorerBase);
    setFeePerKb(String(DEFAULT_SETTINGS.feePerKb));
    task.setStatus('Back to the default settings.', 'success');
  });

  // Tests what is typed, before saving it.
  const test = () => task.run(async () => {
    const base = apiBase.trim().replace(/\/$/, '');
    if (!isHttps(base)) throw new Error('The data address must start with https://.');
    task.setStatus('Testing the connection…');
    const data = await createApi({ ...app.settings, apiBase: base }).woc.price();
    task.setStatus(`Connected. 1 BSV = ${data.rate} ${data.currency || 'USD'}.`, 'success');
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Network settings" icon={SlidersHorizontal}>Choose where blockchain data comes from and what fee to pay.</SectionTitle>
      <div className="field"><LabelWithInfo htmlFor="apiBase" label="Blockchain data source" info="Where we look up balances, coins and past transactions, and where we send new ones. The default is WhatsOnChain, a public BSV service. Only change it if you run or trust another service that works the same way." />
        <input id="apiBase" value={apiBase} spellCheck={false} onChange={e => setApiBase(e.target.value)} />
        <div className="hint">Must start with https:// and work like WhatsOnChain.</div></div>
      <div className="field" style={{ marginTop: 15 }}><LabelWithInfo htmlFor="explorerBase" label="Transaction link" info="The website that opens when you click a transaction to view it. The transaction ID is added to the end of this address." />
        <input id="explorerBase" value={explorerBase} spellCheck={false} onChange={e => setExplorerBase(e.target.value)} />
        <div className="hint">Where "view transaction" links go. The transaction ID is added to the end.</div></div>
      <div className="field" style={{ marginTop: 15 }}><LabelWithInfo htmlFor="feePerKb" label="Network fee (sats per KB)" info="What you pay miners per kilobyte of transaction. At 100, a simple transfer costs about 20 sats. Too low and miners may ignore it; too high wastes money." />
        <input id="feePerKb" type="number" min={1} max={MAX_FEE_PER_KB} value={feePerKb} onChange={e => setFeePerKb(e.target.value)} />
        <div className="hint">Moves into a BRC-100 wallet use that wallet's own fee instead.</div></div>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy} onClick={save}><Save size={16} /> Save settings</button>
        <button className="btn btn-ghost" disabled={task.busy} onClick={reset}><RotateCcw size={16} /> Reset defaults</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={test}><Activity size={16} /> Test connection</button>
      </div>
      <Status status={task.status} />
      <div className="divider" />
      <p className="mini">NFT and token safety checks use GorillaPool (ordinals.gorillapool.io). If it can't be reached, we don't create any transaction, so your NFTs stay safe.</p>
    </div></div>
  );
}
