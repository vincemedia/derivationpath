import { useRef, useState } from 'react';
import { Download, FileLock2, FileWarning, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useApp } from '../state';
import { decryptVault, downloadJson, encryptVault, localVault, requireStrongPassword, type SeedRecord } from '../lib/vault';
import { SectionLabel, SectionTitle, Status } from './ui';
import { useTask } from '../hooks/useTask';

export function BackupPanel() {
  const app = useApp();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const task = useTask(app.vaultExists
    ? 'An encrypted backup exists in this browser. Enter its password and choose "Restore browser backup".'
    : 'No backup action performed.');

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
      <SectionTitle title="Encrypted backup" icon={FileLock2}>Save an AES-GCM encrypted wallet record or export plain JSON for offline handling.</SectionTitle>
      <p className="mini">The backup stores your mnemonic <b>and</b> PIN/passphrase together, because both are needed to reproduce the wallet — plus the derivation template you selected. Anyone who learns the backup password gets both. Encrypted SatoFinder backups can be restored here too.</p>
      <SectionLabel>Create a backup</SectionLabel>
      <div className="grid-2">
        <div className="field"><label htmlFor="backupPassword">Backup password</label>
          <input id="backupPassword" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Use a strong unique password" /></div>
        <div className="field"><label htmlFor="backupPassword2">Confirm password</label>
          <input id="backupPassword2" type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Repeat password (not needed to restore)" /></div>
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={task.busy} onClick={() => task.run(async () => {
          const payload = await encryptVault(record(), requireStrongPassword(password, password2));
          localVault.write(payload);
          app.syncVault();
          task.setStatus('Encrypted wallet backup saved in this browser. Auto-lock can now be undone with this password.', 'success');
        })}><Save size={16} /> Save encrypted in browser</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(async () => {
          downloadJson(`mnemonic-brc100-encrypted-${Date.now()}.json`, await encryptVault(record(), requireStrongPassword(password, password2)));
          task.setStatus('Encrypted backup downloaded.', 'success');
        })}><Download size={16} /> Download encrypted</button>
        <button className="btn btn-danger" disabled={task.busy} onClick={() => task.run(async () => {
          const r = record();
          if (!(await app.confirm('Download unencrypted secrets?', 'This file will contain your mnemonic and passphrase in plain text. Anyone who gets the file can spend the funds.'))) return;
          downloadJson(`mnemonic-brc100-plain-${Date.now()}.json`, r);
          task.setStatus('Plain JSON downloaded. Store it offline, or delete it once you have written the phrase down.', 'warn');
        })}><FileWarning size={16} /> Download plain JSON</button>
      </div>

      <SectionLabel>Restore</SectionLabel>
      <div className="field"><label htmlFor="restoreFile">Restore encrypted backup file</label><input id="restoreFile" ref={fileRef} type="file" accept="application/json,.json" /></div>
      <div className="actions">
        <button className="btn btn-ink" disabled={task.busy} onClick={() => task.run(async () => {
          const file = fileRef.current?.files?.[0];
          if (!file) throw new Error('Choose an encrypted backup file.');
          let payload;
          try { payload = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON.'); }
          app.restoreRecord(await decryptVault(payload, requirePassword()), 'Encrypted backup file restored.');
        })}><Upload size={16} /> Restore file</button>
        <button className="btn btn-secondary" disabled={task.busy} onClick={() => task.run(async () => {
          const payload = localVault.read();
          if (!payload) throw new Error('No encrypted browser backup exists.');
          app.restoreRecord(await decryptVault(payload, requirePassword()), 'Browser backup restored.');
        })}><RotateCcw size={16} /> Restore browser backup</button>
        <button className="btn btn-danger" disabled={task.busy} onClick={() => task.run(async () => {
          if (!(await app.confirm('Delete browser backup?', 'This permanently removes the encrypted backup from this browser profile. If you have not written your phrase down, the funds are gone.'))) return;
          localVault.remove();
          app.syncVault();
          task.setStatus('Encrypted browser backup deleted.', 'warn');
        })}><Trash2 size={16} /> Delete browser backup</button>
      </div>
      <Status status={task.status} />
    </div></div>
  );
}
