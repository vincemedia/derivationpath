import { useState } from 'react';
import { Activity, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../state';
import { DEFAULT_SETTINGS, MAX_FEE_PER_KB, isHttps, sanitizeFee } from '../lib/settings';
import { createApi } from '../lib/net';
import { fmtSats } from '../lib/format';
import { SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';

export function SettingsPanel() {
  const app = useApp();
  const [apiBase, setApiBase] = useState(app.settings.apiBase);
  const [explorerBase, setExplorerBase] = useState(app.settings.explorerBase);
  const [feePerKb, setFeePerKb] = useState(String(app.settings.feePerKb));
  const task = useTask('Using default public endpoints.');

  const save = () => task.run(async () => {
    const api = apiBase.trim().replace(/\/$/, '');
    const explorer = explorerBase.trim();
    if (!isHttps(api)) throw new Error('API base must be an HTTPS URL.');
    if (!isHttps(explorer)) throw new Error('Explorer base must be an HTTPS URL.');
    const fee = sanitizeFee(feePerKb);
    app.updateSettings({ apiBase: api, explorerBase: explorer, feePerKb: fee });
    setApiBase(api);
    setFeePerKb(String(fee));
    const asked = Number.parseInt(feePerKb.trim(), 10);
    if (!Number.isInteger(asked) || asked !== fee) {
      throw new Error(`Fee rate must be a whole number from 1 to ${fmtSats(MAX_FEE_PER_KB)} sat/KB — saved as ${fmtSats(fee)}. Other settings saved.`);
    }
    task.setStatus(`Settings saved. Fee rate ${fmtSats(fee)} sat/KB.`, 'success');
  });

  const reset = () => task.run(async () => {
    app.updateSettings({ ...DEFAULT_SETTINGS });
    setApiBase(DEFAULT_SETTINGS.apiBase);
    setExplorerBase(DEFAULT_SETTINGS.explorerBase);
    setFeePerKb(String(DEFAULT_SETTINGS.feePerKb));
    task.setStatus('Default endpoints restored.', 'success');
  });

  // Tests what is typed, before saving it.
  const test = () => task.run(async () => {
    const base = apiBase.trim().replace(/\/$/, '');
    if (!isHttps(base)) throw new Error('API base must be an HTTPS URL.');
    task.setStatus('Testing API…');
    const data = await createApi({ ...app.settings, apiBase: base }).woc.price();
    task.setStatus(`API responded. Rate: ${data.rate} ${data.currency || 'USD'}.`, 'success');
  });

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Network settings" icon={SlidersHorizontal}>Configure endpoints used for public blockchain data and transaction broadcast.</SectionTitle>
      <div className="field"><label htmlFor="apiBase">WhatsOnChain API base</label>
        <input id="apiBase" value={apiBase} spellCheck={false} onChange={e => setApiBase(e.target.value)} />
        <div className="hint">Must be HTTPS and WhatsOnChain-compatible.</div></div>
      <div className="field" style={{ marginTop: 15 }}><label htmlFor="explorerBase">Explorer transaction base</label>
        <input id="explorerBase" value={explorerBase} spellCheck={false} onChange={e => setExplorerBase(e.target.value)} />
        <div className="hint">Must be an HTTPS URL; the txid is appended.</div></div>
      <div className="field" style={{ marginTop: 15 }}><label htmlFor="feePerKb">Fee rate (satoshis per KB)</label>
        <input id="feePerKb" type="number" min={1} max={MAX_FEE_PER_KB} value={feePerKb} onChange={e => setFeePerKb(e.target.value)} />
        <div className="hint">Used by Send and by recovery sweeps to an address. BRC-100 sweeps use the wallet's own fee.</div></div>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy} onClick={save}><Save size={16} /> Save settings</button>
        <button className="btn btn-ghost" disabled={task.busy} onClick={reset}><RotateCcw size={16} /> Reset defaults</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={test}><Activity size={16} /> Test API</button>
      </div>
      <Status status={task.status} />
      <div className="divider" />
      <p className="mini">The ordinal/token check always uses GorillaPool's 1Sat indexer (ordinals.gorillapool.io). If it is unreachable, no transaction is built.</p>
    </div></div>
  );
}
