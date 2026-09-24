import { HD, Mnemonic, PrivateKey, Utils } from '@bsv/sdk';

/**
 * A derivation template is a BIP32 path with `{chain}` and `{index}`
 * placeholders, e.g. m/44'/0'/0'/{chain}/{index}. `{chain}` is optional:
 * some legacy wallets (Centbee, RockWallet) only ever used a single chain.
 */
export interface Preset {
  id: string;
  label: string;
  template: string;
}

export const PRESETS: Preset[] = [
  { id: 'centbee', label: "Centbee — m/44'/0/0/i", template: "m/44'/0/0/{index}" },
  { id: 'rock', label: "RockWallet — m/0'/0/i", template: "m/0'/0/{index}" },
  { id: 'bip44', label: "BIP44 default — m/44'/0'/0'/c/i", template: "m/44'/0'/0'/{chain}/{index}" },
  { id: 'moneybutton', label: 'MoneyButton — coin type 0', template: "m/44'/0'/0'/{chain}/{index}" },
  { id: 'twetch', label: 'Twetch — coin type 0', template: "m/44'/0'/0'/{chain}/{index}" },
  { id: 'electrumsv', label: 'ElectrumSV — coin type 236', template: "m/44'/236'/0'/{chain}/{index}" },
  { id: 'exodus', label: 'Exodus — coin type 236', template: "m/44'/236'/0'/{chain}/{index}" },
  { id: 'relayx', label: 'RelayX — coin type 236', template: "m/44'/236'/0'/{chain}/{index}" },
  { id: 'keevo', label: 'Keevo — coin type 236', template: "m/44'/236'/0'/{chain}/{index}" },
  { id: 'atomic', label: 'Atomic — coin type 145', template: "m/44'/145'/0'/{chain}/{index}" },
  { id: 'simplycash', label: 'SimplyCash — coin type 145', template: "m/44'/145'/0'/{chain}/{index}" },
  { id: 'bip32', label: "BIP32 basic — m/0'/c'/i'", template: "m/0'/{chain}'/{index}'" },
  // The two prefixes this tool originally shipped as "Electrum SV" and
  // "Common elsewhere". Kept so earlier recoveries remain reproducible.
  { id: 'legacy236', label: "Legacy prefix — m/44'/236'/0'/i", template: "m/44'/236'/0'/{index}" },
  { id: 'legacy0', label: "Legacy prefix — m/44'/0'/0'/i", template: "m/44'/0'/0'/{index}" },
];

export const DEFAULT_PRESET = 'centbee';
export const presetById = (id: string) => PRESETS.find(p => p.id === id);

/** Unique templates across all presets, for "try every known path" scans. */
export const UNIQUE_TEMPLATES = [...new Set(PRESETS.map(p => p.template))];

export const ENTROPY_TO_WORDS: Record<number, number> = { 128: 12, 160: 15, 192: 18, 224: 21, 256: 24 };
const VALID_WORD_COUNTS = new Set(Object.values(ENTROPY_TO_WORDS));

/** Accepts ’ (typographic) and h/H as hardened markers and tidies whitespace. */
export function normalizeTemplate(template: string): string {
  return template.trim().replace(/\s+/g, '').replace(/[’‘`]/g, "'").replace(/(\d)[hH]/g, "$1'");
}

const SEGMENT = /^(\d+|\{chain\}|\{index\})'?$/;

/** Throws a user-facing error when the template can't be derived. */
export function validateTemplate(raw: string): string {
  const template = normalizeTemplate(raw);
  const parts = template.split('/');
  if (parts[0] !== 'm') throw new Error('A derivation template must start with "m/".');
  if (parts.length < 2) throw new Error('A derivation template needs at least one level below "m".');
  for (const p of parts.slice(1)) {
    if (!SEGMENT.test(p)) throw new Error(`Invalid path segment "${p}". Use numbers, ' for hardened, {chain} and {index}.`);
    const n = Number.parseInt(p, 10);
    if (Number.isFinite(n) && n >= 0x80000000) throw new Error(`Path segment "${p}" is out of range.`);
  }
  const indexCount = parts.filter(p => p.startsWith('{index}')).length;
  if (indexCount !== 1) throw new Error('A derivation template must contain {index} exactly once.');
  if (parts.filter(p => p.startsWith('{chain}')).length > 1) throw new Error('{chain} may appear at most once.');
  return template;
}

export const templateHasChain = (template: string) => template.includes('{chain}');

export function resolvePath(template: string, chain: number, index: number): string {
  return template.replace('{chain}', String(chain)).replace('{index}', String(index));
}

export const normalizeMnemonic = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The word-count assertion guards against a library silently returning less
 * entropy than asked for — a user who asks for 24 words and quietly gets 12
 * has a materially weaker wallet than they believe, and nothing else would notice.
 */
export function generateMnemonic(entropyBits: number): string {
  const expected = ENTROPY_TO_WORDS[entropyBits];
  if (!expected) throw new Error(`Unsupported entropy size: ${entropyBits}`);
  const phrase = Mnemonic.fromRandom(entropyBits).toString();
  const actual = phrase.split(' ').length;
  if (actual !== expected) {
    throw new Error(`Refusing to use this phrase: asked for ${entropyBits}-bit entropy (${expected} words) but the library produced ${actual} words.`);
  }
  return phrase;
}

/** Validates a phrase and returns its normalized form. */
export function validateMnemonic(text: string): string {
  const normalized = normalizeMnemonic(text);
  if (!normalized) throw new Error('Enter a mnemonic phrase first.');
  const words = normalized.split(' ').length;
  if (!VALID_WORD_COUNTS.has(words)) throw new Error(`Expected a 12, 15, 18, 21 or 24-word phrase, got ${words} words.`);
  if (!new Mnemonic(normalized).check()) throw new Error('The mnemonic phrase is not valid (unknown word or bad checksum).');
  return normalized;
}

/**
 * The BIP39 passphrase (Centbee calls it a PIN) is seed material, not a login:
 * a different passphrase is a different wallet.
 */
export function rootFromMnemonic(mnemonic: string, passphrase: string): HD {
  const normalized = validateMnemonic(mnemonic);
  return HD.fromSeed(new Mnemonic(normalized).toSeed(passphrase));
}

export interface DerivedKey {
  path: string;
  chain: number;
  index: number;
  privateKey: PrivateKey;
  wif: string;
  publicKey: string;
  address: string;
}

export function deriveKey(root: HD, template: string, chain: number, index: number): DerivedKey {
  const path = resolvePath(template, chain, index);
  const privateKey = root.derive(path).privKey as PrivateKey;
  const publicKey = privateKey.toPublicKey();
  return {
    path,
    chain,
    index,
    privateKey,
    wif: privateKey.toWif(),
    publicKey: publicKey.toString(),
    address: publicKey.toAddress().toString(),
  };
}

/** Mainnet P2PKH address check (base58check, version byte 0x00, 20-byte hash). */
export function isValidAddress(address: string): boolean {
  try {
    const { prefix, data } = Utils.fromBase58Check(address.trim());
    return Array.isArray(prefix) && prefix.length === 1 && prefix[0] === 0x00 && data.length === 20;
  } catch {
    return false;
  }
}

/** A fingerprint over PUBLIC data only — hashing the mnemonic would publish a verification oracle for guessed phrases. */
export async function addressFingerprint(address: string, path: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${address}|${path}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
