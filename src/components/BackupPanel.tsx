import { useRef, useState } from 'react';
import { Download, FileLock2, FileWarning, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useApp } from '../state';
import { decryptVault, downloadJson, encryptVault, localVault, requireStrongPassword, type SeedRecord } from '../lib/vault';
import { SectionLabel, SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';
import { LabelWithInfo } from './InfoTip';

export function BackupPanel() {
  const app = useApp();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const task = useTask(app.vaultExists
    ? 'A backup is saved in this browser. Enter its password and press "Restore browser backup".'
    : 'No backup yet.');

  const record = (): SeedRecord => {
    if (!app.session) throw new Error('Load a wallet first.');
    const { presetId, template, chain, index } = app.selection;
    return { mnemonic: app.session.mnemonic, passphrase: app.session.passphrase, template, presetId, chain, index };
  };

  const requirePassword = () => {
    if (!password) throw new Error('Enter the backup password.');
    return password;
  };

  return (
    <div className="card"><div className="card-body">
      <SectionTitle title="Encrypted backup" icon={FileLock2}>Save your seed phrase locked with a password, so you can get back in later.</SectionTitle>
      <p className="mini">The backup holds your seed phrase <b>and</b> PIN/passphrase (you need both to rebuild the wallet), plus the path you picked. Anyone with the backup password can take your coins, so make it strong.</p>
      <SectionLabel>Create a backup</SectionLabel>
      <div className="grid-2">
        <div className="field"><LabelWithInfo htmlFor="backupPassword" label="Backup password" info="Locks your backup. You&apos;ll need it to unlock this page or restore the file. Use at least 10 characters, ideally a phrase only you know. If you forget it, the backup can&apos;t be opened." />
          <input id="backupPassword" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Use a strong unique password" /></div>
        <div className="field"><LabelWithInfo htmlFor="backupPassword2" label="Confirm password" info="Type the same password again, so a typo doesn&apos;t lock you out of your own backup. Not needed when restoring." />
          <input id="backupPassword2" type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Repeat password (not needed to restore)" /></div>
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(async () => {
          const payload = await encryptVault(record(), requireStrongPassword(password, password2));
          localVault.write(payload);
          app.syncVault();
          task.setStatus('Backup saved in this browser. If the page locks, unlock it with this password.', 'success');
        })}><Save size={16} /> Save in this browser</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(async () => {
          downloadJson(`derivation-path-backup-${Date.now()}.json`, await encryptVault(record(), requireStrongPassword(password, password2)));
          task.setStatus('Backup file downloaded.', 'success');
        })}><Download size={16} /> Download backup file</button>
        <button className="btn btn-danger" disabled={task.busy} onClick={() => task.run(async () => {
          const r = record();
          if (!(await app.confirm('Download without a password?', 'This file shows your seed phrase and passphrase in plain text. Anyone who gets it can take your coins.'))) return;
          downloadJson(`derivation-path-UNPROTECTED-${Date.now()}.json`, r);
          task.setStatus('Downloaded. Keep the file offline, or delete it once your phrase is written down.', 'warn');
        })}><FileWarning size={16} /> Download without password</button>
      </div>

      <SectionLabel>Restore</SectionLabel>
      <div className="field"><LabelWithInfo htmlFor="restoreFile" label="Backup file" info="A backup file you downloaded earlier (it ends in .json). Choose it, type its password in the Backup password box above, then press Restore file." /><input id="restoreFile" ref={fileRef} type="file" accept="application/json,.json" /></div>
      <div className="actions">
        <button className="btn btn-ink" disabled={task.busy} onClick={() => task.run(async () => {
          const file = fileRef.current?.files?.[0];
          if (!file) throw new Error('Choose a backup file first.');
          let payload;
          try { payload = JSON.parse(await file.text()); } catch { throw new Error("That doesn't look like a backup file."); }
          app.restoreRecord(await decryptVault(payload, requirePassword()), 'Backup restored.');
        })}><Upload size={16} /> Restore file</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(async () => {
          const payload = localVault.read();
          if (!payload) throw new Error("There's no backup saved in this browser.");
          app.restoreRecord(await decryptVault(payload, requirePassword()), 'Backup restored.');
        })}><RotateCcw size={16} /> Restore browser backup</button>
        <button className="btn btn-danger" disabled={task.busy} onClick={() => task.run(async () => {
          if (!(await app.confirm('Delete browser backup?', "This removes the backup from this browser for good. If your phrase isn't written down somewhere, you could lose your coins."))) return;
          localVault.remove();
          app.syncVault();
          task.setStatus('Backup deleted from this browser.', 'warn');
        })}><Trash2 size={16} /> Delete browser backup</button>
      </div>
      <Status status={task.status} />
    </div></div>
  );
}
