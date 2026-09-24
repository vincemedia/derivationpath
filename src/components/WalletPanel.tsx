import { useState } from 'react';
import { AlertTriangle, ChevronRight, Copy, Download, Eye, EyeOff, KeyRound, Lock, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../state';
import { ENTROPY_TO_WORDS, PRESETS, generateMnemonic, presetById, templateHasChain, validateTemplate } from '../lib/derive';
import { decryptVault, localVault } from '../lib/vault';
import { safeInt } from '../lib/format';
import { LOCK_IDLE_MS } from '../hooks/useAutoLock';
import { SectionLabel, SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';

type CopyField = 'mnemonic' | 'wif' | 'publicKey' | 'address' | 'fingerprint';

export function WalletPanel() {
  const app = useApp();
  const { session, selection, selected } = app;
  const [mnemonic, setMnemonic] = useState(session?.mnemonic ?? '');
  const [passphrase, setPassphrase] = useState(session?.passphrase ?? '');
  const [bits, setBits] = useState(256);
  const [templateDraft, setTemplateDraft] = useState(selection.template);
  const [templateError, setTemplateError] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const task = useTask(app.notice || (session ? 'Wallet loaded.' : 'No wallet is loaded.'));

  const hasChain = templateHasChain(selection.template);

  const applyPreset = (id: string) => {
    const preset = presetById(id);
    if (!preset) { app.setSelection({ ...selection, presetId: 'custom' }); return; }
    setTemplateDraft(preset.template);
    setTemplateError('');
    app.setSelection({ presetId: id, template: preset.template, chain: 0, index: 0 });
  };

  const applyTemplate = (raw: string) => {
    setTemplateDraft(raw);
    try {
      const template = validateTemplate(raw);
      setTemplateError('');
      const match = PRESETS.find(p => p.id === selection.presetId && p.template === template);
      app.setSelection({ ...selection, template, presetId: match ? match.id : 'custom', chain: templateHasChain(template) ? selection.chain : 0 });
    } catch (e) {
      setTemplateError((e as Error).message);
    }
  };

  const step = (chain: number) => app.setSelection({
    ...selection,
    chain,
    index: selection.chain === chain ? selection.index + 1 : 0,
  });

  const copy = async (field: CopyField) => {
    if (!selected) return;
    const values: Record<CopyField, string> = {
      mnemonic: session?.mnemonic ?? '', wif: selected.wif, publicKey: selected.publicKey,
      address: selected.address, fingerprint: app.fingerprint,
    };
    const isSecret = field === 'mnemonic' || field === 'wif';
    if (isSecret && !(await app.confirm('Copy secret to clipboard?', 'Clipboard contents may be readable by other applications, and may sync across your devices.'))) return;
    try {
      await navigator.clipboard.writeText(values[field]);
      task.setStatus(`${field === 'wif' ? 'Private key' : field} copied to clipboard.`, isSecret ? 'warn' : 'success');
    } catch (e) {
      task.setStatus(`Clipboard write failed: ${(e as Error).message}`, 'error');
    }
  };

  const toggleReveal = async () => {
    if (!revealed && !(await app.confirm('Reveal wallet secrets?', 'Anyone who can see your screen will be able to read your mnemonic and private key, and take the funds.'))) return;
    setRevealed(!revealed);
  };

  const keyRow = (label: string, value: string, field: CopyField, secret = false) => (
    <div key={field} className={`key-row${secret ? ' secret' : ''}${secret && revealed ? ' revealed' : ''}`}>
      <div className="key-row-head"><small>{label}</small><button className="copy" onClick={() => copy(field)}><Copy size={12} /> Copy</button></div>
      <div className="key-value">{value}</div>
    </div>
  );

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Wallet & derivation" icon={KeyRound}>Create a new phrase or import an existing wallet, then select the exact address path.</SectionTitle>

      {app.lock.engaged && (
        <div className="lockbar">
          <div className="lockbar-head"><Lock size={18} aria-hidden /><strong>Wallet locked</strong><span className="mini">Locked after {app.lock.reason}.</span></div>
          <p className="mini">
            {app.vaultExists
              ? 'Your keys were cleared from this page. Enter your backup password to restore the encrypted wallet saved in this browser.'
              : 'Your keys were cleared from this page. No encrypted backup is saved here, so re-import your mnemonic phrase below to continue.'}
          </p>
          {app.vaultExists && (
            <div className="grid-2">
              <div className="field"><label htmlFor="lockPassword">Backup password</label>
                <input id="lockPassword" type="password" autoComplete="current-password" value={lockPassword} onChange={e => setLockPassword(e.target.value)} placeholder="Password for this browser's backup" /></div>
              <div className="field" style={{ alignSelf: 'end' }}>
                <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(async () => {
                  const payload = localVault.read();
                  if (!payload) throw new Error('No encrypted backup exists in this browser.');
                  if (!lockPassword) throw new Error('Enter your backup password.');
                  app.restoreRecord(await decryptVault(payload, lockPassword), 'Unlocked. Wallet restored from the encrypted browser backup.');
                })}>Unlock</button>
              </div>
            </div>
          )}
        </div>
      )}

      {session && !app.vaultExists && (
        <div className="status warn" style={{ margin: '0 0 22px' }}>
          <AlertTriangle size={16} aria-hidden /><span>No encrypted backup is saved in this browser. This wallet locks after {LOCK_IDLE_MS / 60000} minutes of inactivity, and locking wipes it — you would need to re-import your phrase. Save a backup on the Backup panel to unlock with a password instead.</span>
        </div>
      )}

      <SectionLabel>Derivation path</SectionLabel>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="walletPreset">Wallet preset</label>
          <select id="walletPreset" value={selection.presetId} onChange={e => applyPreset(e.target.value)}>
            <option value="custom">Custom path</option>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="template">Derivation template</label>
          <input id="template" value={templateDraft} spellCheck={false} onChange={e => applyTemplate(e.target.value)} />
          <div className={`hint${templateError ? ' error-text' : ''}`}>{templateError || <>Use <code>{'{chain}'}</code> and <code>{'{index}'}</code> as placeholders. ' marks a hardened level.</>}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 15 }}>
        <div className="field"><label htmlFor="chain">Chain</label>
          <select id="chain" value={hasChain ? selection.chain : 0} disabled={!hasChain} onChange={e => app.setSelection({ ...selection, chain: safeInt(e.target.value) })}>
            <option value={0}>0 — Receive</option><option value={1}>1 — Change</option>
          </select></div>
        <div className="field"><label htmlFor="addressIndex">Address index</label>
          <input id="addressIndex" type="number" min={0} value={selection.index} onChange={e => app.setSelection({ ...selection, index: safeInt(e.target.value) })} /></div>
        <div className="field"><label>Derived path</label><input readOnly value={selected?.path ?? '—'} /></div>
      </div>

      <SectionLabel>Recovery phrase</SectionLabel>
      <div className="field"><label htmlFor="mnemonicInput">Mnemonic phrase</label>
        <textarea id="mnemonicInput" autoComplete="off" autoCapitalize="none" spellCheck={false} value={mnemonic} onChange={e => setMnemonic(e.target.value)}
          placeholder="Enter an existing 12 or 24-word BIP39 phrase, or generate a new one" />
        <div className="hint">The phrase is processed locally. It is never sent to any API.</div></div>

      <div className="grid-2" style={{ marginTop: 15 }}>
        <div className="field">
          <label htmlFor="passphrase">PIN / BIP39 passphrase (optional)</label>
          <input id="passphrase" type="password" autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Leave empty if you never set one" />
          <div className="hint">Centbee's PIN is this "25th word". A different passphrase derives a completely different wallet — losing it loses the funds.</div>
        </div>
        <div className="field">
          <label htmlFor="wordCount">New phrase length</label>
          <select id="wordCount" value={bits} onChange={e => setBits(safeInt(e.target.value, 256))}>
            <option value={128}>12 words (128-bit)</option><option value={256}>24 words (256-bit)</option>
          </select>
          <div className="hint">Applies to "Generate new phrase" only.</div>
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(() => {
          const phrase = generateMnemonic(bits);
          app.loadWallet(phrase, passphrase, `New ${ENTROPY_TO_WORDS[bits]}-word phrase generated locally. Write it down offline — with its passphrase, if you set one — before funding this wallet.`);
        })}><Sparkles size={16} /> Generate new phrase</button>
        <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(() => {
          app.loadWallet(mnemonic, passphrase, `Wallet loaded.${passphrase ? ' A BIP39 passphrase is applied.' : ''} Secrets are hidden.`);
        })}><Download size={16} /> Import / derive</button>
        <button className="btn btn-ghost" disabled={task.busy} onClick={async () => {
          if (await app.confirm('Clear wallet?', 'This removes wallet data from the current page session. It does not delete an encrypted browser backup.')) app.clearWallet();
        }}><Trash2 size={16} /> Clear wallet</button>
      </div>

      {session && selected && (
        <div className="key-grid">
          {keyRow('Mnemonic', session.mnemonic, 'mnemonic', true)}
          {keyRow('Private key (WIF)', selected.wif, 'wif', true)}
          {keyRow('Public key', selected.publicKey, 'publicKey')}
          {keyRow('Address', selected.address, 'address')}
          {keyRow('Address fingerprint (SHA-256 of address + path)', app.fingerprint, 'fingerprint')}
          <div className="actions">
            <button className="btn btn-danger" onClick={toggleReveal}>{revealed ? <><EyeOff size={16} /> Hide secrets</> : <><Eye size={16} /> Reveal secrets</>}</button>
            <button className="btn btn-secondary" onClick={() => step(0)}><ChevronRight size={16} /> Next receive</button>
            <button className="btn btn-secondary" disabled={!hasChain} onClick={() => step(1)}><ChevronRight size={16} /> Next change</button>
            <button className="btn btn-ghost" onClick={app.lockNow}><Lock size={16} /> Lock now</button>
          </div>
        </div>
      )}
      {session && app.selectedError && <Status status={{ text: app.selectedError, type: 'error' }} />}
      <Status status={task.status} />
    </div></div>
  );
}
