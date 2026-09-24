import { useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ChevronRight, Copy, Download, Eye, EyeOff, KeyRound, Lock, Repeat2, Shield, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../state';
import { ENTROPY_TO_WORDS, PRESETS, generateMnemonic, presetById, templateHasChain, validateTemplate } from '../lib/derive';
import { decryptVault, localVault } from '../lib/vault';
import { safeInt } from '../lib/format';
import { LOCK_IDLE_MS } from '../hooks/useAutoLock';
import { SectionLabel, SectionTitle, Status } from './ui';
import { PresetPicker } from './PresetPicker';
import { OptionIcon, Select } from './Select';
import { LabelWithInfo } from './InfoTip';
import { useTask } from '../hooks/useTask';

type CopyField = 'mnemonic' | 'wif' | 'publicKey' | 'address' | 'fingerprint';

const COPY_NAMES: Record<CopyField, string> = {
  mnemonic: 'Seed phrase', wif: 'Private key', publicKey: 'Public key', address: 'Address', fingerprint: 'Fingerprint',
};

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
    if (isSecret && !(await app.confirm('Copy secret to clipboard?', 'Other apps can read your clipboard, and it may sync to your other devices.'))) return;
    try {
      await navigator.clipboard.writeText(values[field]);
      task.setStatus(`${COPY_NAMES[field]} copied.`, isSecret ? 'warn' : 'success');
    } catch (e) {
      task.setStatus(`Couldn't copy: ${(e as Error).message}`, 'error');
    }
  };

  const toggleReveal = async () => {
    if (!revealed && !(await app.confirm('Show your secrets?', 'Anyone who can see your screen can read your seed phrase and private key, and take your coins.'))) return;
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
      <SectionTitle title="Wallet & derivation" icon={KeyRound}>Enter your seed phrase (or make a new one), then choose which address to look at.</SectionTitle>

      {app.lock.engaged && (
        <div className="lockbar">
          <div className="lockbar-head"><Lock size={18} aria-hidden /><strong>Wallet locked</strong><span className="mini">Locked after {app.lock.reason}.</span></div>
          <p className="mini">
            {app.vaultExists
              ? 'Your keys were wiped from this page. Enter your backup password to unlock.'
              : 'Your keys were wiped from this page. Type your seed phrase again below to continue.'}
          </p>
          {app.vaultExists && (
            <div className="grid-2">
              <div className="field"><label htmlFor="lockPassword">Backup password</label>
                <input id="lockPassword" type="password" autoComplete="current-password" value={lockPassword} onChange={e => setLockPassword(e.target.value)} placeholder="Your backup password" /></div>
              <div className="field" style={{ alignSelf: 'end' }}>
                <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(async () => {
                  const payload = localVault.read();
                  if (!payload) throw new Error("There's no backup saved in this browser.");
                  if (!lockPassword) throw new Error('Enter your backup password.');
                  app.restoreRecord(await decryptVault(payload, lockPassword), 'Unlocked.');
                })}>Unlock</button>
              </div>
            </div>
          )}
        </div>
      )}

      {session && !app.vaultExists && (
        <div className="status warn" style={{ margin: '0 0 22px' }}>
          <AlertTriangle size={16} aria-hidden /><span>No backup saved. After {LOCK_IDLE_MS / 60000} minutes without activity this page locks and wipes your keys, so you'd have to type your seed phrase again. Save a backup on the Backup tab to unlock with a password instead.</span>
        </div>
      )}

      <SectionLabel>Derivation path</SectionLabel>
      <div className="grid-2">
        <div className="field">
          <LabelWithInfo htmlFor="walletPreset" label="Wallet preset" info="Every wallet app turns your seed phrase into addresses with its own recipe. Pick the app you used and we follow the same recipe to find your coins. Not sure which? Scan every preset on the Recover tab." />
          <PresetPicker id="walletPreset" value={selection.presetId} onChange={applyPreset} />
        </div>
        <div className="field">
          <LabelWithInfo htmlFor="template" label="Derivation template" info={<>The recipe, written as a path. Each number is one step from your seed to an address, and a &apos; marks an extra-private &ldquo;hardened&rdquo; step. {'{chain}'} and {'{index}'} are blanks we fill in as we walk through your addresses.</>} />
          <input id="template" value={templateDraft} spellCheck={false} onChange={e => applyTemplate(e.target.value)} />
          <div className={`hint${templateError ? ' error-text' : ''}`}>{templateError || <><code>{'{chain}'}</code> and <code>{'{index}'}</code> fill in automatically.</>}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 15 }}>
        <div className="field"><LabelWithInfo htmlFor="chain" label="Chain" info="Wallets keep two lists of addresses. Receive (0) holds the ones you give out to get paid. Change (1) holds the ones your wallet sends leftover coins back to after you pay someone." />
          <Select id="chain" value={String(hasChain ? selection.chain : 0)} disabled={!hasChain} onChange={v => app.setSelection({ ...selection, chain: safeInt(v) })} options={[
            { value: '0', label: '0: Receive', detail: 'Addresses you give out', icon: <OptionIcon><ArrowDownLeft size={13} /></OptionIcon> },
            { value: '1', label: '1: Change', detail: 'Leftovers sent back to you', icon: <OptionIcon><Repeat2 size={13} /></OptionIcon> },
          ]} /></div>
        <div className="field"><LabelWithInfo htmlFor="addressIndex" label="Address index" info="Which address in the list, counting from 0. Wallets hand out a fresh address each time, so #0 is your first, #1 your second, and so on." />
          <input id="addressIndex" type="number" min={0} value={selection.index} onChange={e => app.setSelection({ ...selection, index: safeInt(e.target.value) })} /></div>
        <div className="field"><LabelWithInfo htmlFor="derivedPath" label="Derived path" info="The full path for the address shown below: the template with chain and index filled in. The same phrase and the same path always give the same address." /><input id="derivedPath" readOnly value={selected?.path ?? '-'} /></div>
      </div>

      <SectionLabel>Recovery phrase</SectionLabel>
      <div className="field"><label htmlFor="mnemonicInput">Seed phrase</label>
        <textarea id="mnemonicInput" autoComplete="off" autoCapitalize="none" spellCheck={false} value={mnemonic} onChange={e => setMnemonic(e.target.value)}
          placeholder="Type your 12 or 24 words, separated by spaces" />
        <div className="hint">Your phrase stays in this browser. It's never sent anywhere.</div></div>

      <div className="grid-2" style={{ marginTop: 15 }}>
        <div className="field">
          <LabelWithInfo htmlFor="passphrase" label="PIN / BIP39 passphrase (optional)" info="An optional extra password mixed into your seed. Leave it empty unless you set one. A different passphrase opens a completely different wallet, so a typo shows an empty wallet instead of an error." />
          <input id="passphrase" type="password" autoComplete="off" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Leave empty if you never set one" />
          <div className="hint">Centbee users: enter your PIN here. If you lose it, you lose access to the coins.</div>
        </div>
        <div className="field">
          <LabelWithInfo htmlFor="wordCount" label="New phrase length" info="Only used when you generate a new phrase. 24 words is stronger than 12, but both are far beyond anyone&apos;s ability to guess. Write the words on paper, in order, and keep them offline." />
          <Select id="wordCount" value={String(bits)} onChange={v => setBits(safeInt(v, 256))} options={[
            { value: '128', label: '12 words', detail: 'Strong, and quicker to write down', icon: <OptionIcon><Shield size={13} /></OptionIcon> },
            { value: '256', label: '24 words', detail: 'Strongest', icon: <OptionIcon><ShieldCheck size={13} /></OptionIcon> },
          ]} />
          <div className="hint">Only used for "Generate new phrase".</div>
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(() => {
          const phrase = generateMnemonic(bits);
          app.loadWallet(phrase, passphrase, `New ${ENTROPY_TO_WORDS[bits]}-word phrase created. Write it on paper (plus your passphrase, if you set one) before you put any money in.`);
        })}><Sparkles size={16} /> Generate new phrase</button>
        <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(() => {
          app.loadWallet(mnemonic, passphrase, `Wallet loaded${passphrase ? ' with your passphrase' : ''}. Your seed phrase and private key are hidden.`);
        })}><Download size={16} /> Load wallet</button>
        <button className="btn btn-ghost" disabled={task.busy} onClick={async () => {
          if (await app.confirm('Clear wallet?', 'This wipes the wallet from this page. A saved backup is not deleted.')) app.clearWallet();
        }}><Trash2 size={16} /> Clear wallet</button>
      </div>

      {session && selected && (
        <div className="key-grid">
          {keyRow('Seed phrase', session.mnemonic, 'mnemonic', true)}
          {keyRow('Private key (WIF)', selected.wif, 'wif', true)}
          {keyRow('Public key', selected.publicKey, 'publicKey')}
          {keyRow('Address', selected.address, 'address')}
          {keyRow('Address fingerprint', app.fingerprint, 'fingerprint')}
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
