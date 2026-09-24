// AES-GCM encrypted wallet record, keyed by PBKDF2-SHA256.
//
// Payload is the seed material only: mnemonic + BIP39 passphrase + where to
// look. Derived keys are reproducible from those and are never written to disk.

const PBKDF2_ITER = 310_000;            // OWASP 2023 minimum for PBKDF2-SHA256
const MAX_PBKDF2_ITER = 5_000_000;      // a hostile file must not hang the tab
export const VAULT_FORMAT = 'mnemonic-brc100-aes-gcm-v1';
// Older browser-wallet backups use the same construction with a concrete
// path instead of a template. The format ID is fixed data inside those files.
const LEGACY_PATH_FORMAT = 'satofinder-aes-gcm-v2';
const LS_VAULT = 'mnemonic-brc100-vault';

export interface SeedRecord {
  mnemonic: string;
  passphrase: string;
  template: string;
  presetId: string;
  chain: number;
  index: number;
}

export interface VaultPayload {
  format: string;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0)),
};

async function vaultKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptVault(record: SeedRecord, password: string): Promise<VaultPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(password, salt, PBKDF2_ITER);
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    format: VAULT_FORMAT, kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITER,
    salt: b64.encode(salt), iv: b64.encode(iv),
    ciphertext: b64.encode(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

const unharden = (s: string | undefined) => {
  const n = Number.parseInt((s ?? '0').replace("'", ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Legacy backups store a concrete path plus a BIP44/BIP32 mode; map it to a template. */
function fromLegacyPath(r: { mnemonic: string; passphrase?: string; path: string; mode?: string; preset?: string }): SeedRecord {
  const parts = r.path.split('/');
  const is32 = r.mode === '32' || (!r.mode && r.path.startsWith("m/0'"));
  if (is32) {
    return { mnemonic: r.mnemonic, passphrase: r.passphrase || '', template: "m/0'/{chain}'/{index}'", presetId: 'bip32', chain: unharden(parts[2]), index: unharden(parts[3]) };
  }
  return {
    mnemonic: r.mnemonic, passphrase: r.passphrase || '',
    template: `m/44'/${unharden(parts[2])}'/${unharden(parts[3])}'/{chain}/{index}`,
    presetId: 'custom', chain: unharden(parts[4]), index: unharden(parts[5]),
  };
}

export async function decryptVault(payload: VaultPayload, password: string): Promise<SeedRecord> {
  if (payload?.format !== VAULT_FORMAT && payload?.format !== LEGACY_PATH_FORMAT) {
    throw new Error("This isn't a backup file we recognize.");
  }
  const iterations = Number.parseInt(String(payload.iterations), 10);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITER) {
    throw new Error('This backup file looks damaged.');
  }
  const key = await vaultKey(password, b64.decode(payload.salt), iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.decode(payload.iv) }, key, b64.decode(payload.ciphertext));
  } catch {
    throw new Error('Wrong password, or the backup file is damaged.');
  }
  const record = JSON.parse(new TextDecoder().decode(plaintext));
  if (typeof record?.mnemonic !== 'string') throw new Error("This backup doesn't contain a seed phrase.");
  return payload.format === LEGACY_PATH_FORMAT ? fromLegacyPath(record) : record as SeedRecord;
}

export function requireStrongPassword(password: string, confirm: string): string {
  if (password.length < 10) throw new Error('Use a password of at least 10 characters.');
  if (password !== confirm) throw new Error("The passwords don't match.");
  return password;
}

// localStorage can throw (private mode, blocked site data), so every accessor is guarded.
export const localVault = {
  exists(): boolean {
    try { return !!localStorage.getItem(LS_VAULT); } catch { return false; }
  },
  read(): VaultPayload | null {
    try {
      const raw = localStorage.getItem(LS_VAULT);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  write(payload: VaultPayload) {
    try { localStorage.setItem(LS_VAULT, JSON.stringify(payload)); }
    catch { throw new Error("This browser won't let us save here. Download the backup file instead."); }
  },
  remove() {
    try { localStorage.removeItem(LS_VAULT); } catch { /* nothing to remove */ }
  },
};

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
