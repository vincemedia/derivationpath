import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AppContext, type AppState, type LockState, type Selection, type Session } from './state';
import { createApi } from './lib/net';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { DEFAULT_PRESET, addressFingerprint, deriveKey, presetById, rootFromMnemonic, validateMnemonic, validateTemplate } from './lib/derive';
import { localVault, type SeedRecord } from './lib/vault';
import { errorMessage, fmtSats, fmtUsd, safeInt } from './lib/format';
import { useAutoLock } from './hooks/useAutoLock';
import { useTheme } from './hooks/useTheme';
import { ArrowUpRight, Clock3, FileLock2, Gem, KeyRound, Moon, RefreshCw, ScanSearch, ShieldAlert, SlidersHorizontal, Sun } from 'lucide-react';
import { BsvLogo } from './components/BsvLogo';
import { useConfirmDialog } from './components/ConfirmDialog';
import { WalletPanel } from './components/WalletPanel';
import { SendPanel } from './components/SendPanel';
import { RecoverPanel } from './components/RecoverPanel';
import { TokensPanel } from './components/TokensPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { BackupPanel } from './components/BackupPanel';
import { SettingsPanel } from './components/SettingsPanel';

const PANELS = [
  { id: 'wallet', label: 'Wallet', caption: 'Phrase & derivation path', icon: KeyRound, Component: WalletPanel },
  { id: 'recover', label: 'Recover', caption: 'Find & sweep funds', icon: ScanSearch, Component: RecoverPanel },
  { id: 'send', label: 'Send', caption: 'Pay from this address', icon: ArrowUpRight, Component: SendPanel },
  { id: 'tokens', label: 'Tokens', caption: 'Ordinals & BSV-20', icon: Gem, Component: TokensPanel },
  { id: 'history', label: 'History', caption: 'Past transactions', icon: Clock3, Component: HistoryPanel },
  { id: 'backup', label: 'Backup', caption: 'Encrypted export', icon: FileLock2, Component: BackupPanel },
  { id: 'settings', label: 'Settings', caption: 'Network & fees', icon: SlidersHorizontal, Component: SettingsPanel },
] as const;

const defaultSelection = (): Selection => ({
  presetId: DEFAULT_PRESET,
  template: presetById(DEFAULT_PRESET)!.template,
  chain: 0,
  index: 0,
});

const NO_LOCK: LockState = { engaged: false, reason: '' };

function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const api = useMemo(() => createApi(settings), [settings]);
  const [price, setPrice] = useState(0);
  const [priceNote, setPriceNote] = useState('USD per BSV');

  const [session, setSession] = useState<Session | null>(null);
  const [selection, setSelection] = useState<Selection>(defaultSelection);
  const [balance, setBalance] = useState<number | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [lock, setLock] = useState<LockState>(NO_LOCK);
  const [notice, setNotice] = useState('');
  const [vaultExists, setVaultExists] = useState(localVault.exists);
  const [panel, setPanel] = useState<string>('wallet');
  // Bumped whenever the session is replaced or wiped: panels are keyed on it,
  // so every derived key, scan result and built tx they hold is discarded.
  const [epoch, setEpoch] = useState(0);
  const busyRef = useRef(0);
  const { confirm, dialog } = useConfirmDialog();
  const { theme, toggle: toggleTheme } = useTheme();

  const { selected, selectedError } = useMemo(() => {
    if (!session) return { selected: null, selectedError: '' };
    try {
      return { selected: deriveKey(session.root, selection.template, selection.chain, selection.index), selectedError: '' };
    } catch (e) {
      return { selected: null, selectedError: `Could not derive ${selection.template}: ${errorMessage(e)}` };
    }
  }, [session, selection]);

  useEffect(() => {
    let live = true;
    setFingerprint('');
    if (selected) void addressFingerprint(selected.address, selected.path).then(f => { if (live) setFingerprint(f); });
    return () => { live = false; };
  }, [selected]);

  const reloadPrice = useCallback(async () => {
    try {
      const data = await api.woc.price();
      setPrice(Number(data.rate || 0));
      setPriceNote(data.rate ? `${data.currency || 'USD'} per BSV` : 'No market rate returned');
    } catch (e) {
      setPrice(0);
      setPriceNote(errorMessage(e));
    }
  }, [api]);
  useEffect(() => { void reloadPrice(); }, [reloadPrice]);

  const address = selected?.address;
  const refreshBalance = useCallback(async () => {
    if (!address) { setBalance(null); return; }
    try {
      const data = await api.woc.balance(address);
      setBalance(Number(data.confirmed || 0) + Number(data.unconfirmed || 0));
    } catch {
      setBalance(null);
    }
  }, [api, address]);
  useEffect(() => { void refreshBalance(); }, [refreshBalance]);

  const loadWallet = useCallback((mnemonic: string, passphrase: string, message: string, sel?: Selection) => {
    const normalized = validateMnemonic(mnemonic);
    const root = rootFromMnemonic(normalized, passphrase);
    setSession({ mnemonic: normalized, passphrase, root });
    if (sel) setSelection(sel);
    setLock(NO_LOCK);
    setNotice(message);
    setEpoch(e => e + 1);
  }, []);

  const restoreRecord = useCallback((record: SeedRecord, message: string) => {
    const template = validateTemplate(record.template);
    const preset = presetById(record.presetId);
    loadWallet(record.mnemonic, record.passphrase || '', message, {
      presetId: preset && preset.template === template ? preset.id : 'custom',
      template,
      chain: safeInt(record.chain),
      index: safeInt(record.index),
    });
  }, [loadWallet]);

  // Removes every trace of the wallet from state. Shared by Clear and by
  // auto-lock — a lock that left the mnemonic in a hidden input would be decoration.
  const wipe = useCallback((message: string) => {
    setSession(null);
    setBalance(null);
    setNotice(message);
    setEpoch(e => e + 1);
  }, []);

  const engageLock = useCallback((reason: string) => {
    wipe('Wallet locked. Keys have been cleared from memory.');
    setLock({ engaged: true, reason });
    setPanel('wallet');
  }, [wipe]);

  const clearWallet = useCallback(() => {
    setLock(NO_LOCK);
    wipe('Wallet cleared from this page session.');
  }, [wipe]);

  const lockNow = useCallback(() => engageLock('you locked it'), [engageLock]);

  useAutoLock(!!session, engageLock, busyRef);

  const beginBusy = useCallback(() => {
    busyRef.current++;
    let released = false;
    return () => { if (!released) { released = true; busyRef.current--; } };
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const syncVault = useCallback(() => setVaultExists(localVault.exists()), []);

  const state: AppState = {
    settings, updateSettings, api, price, reloadPrice,
    session, selection, setSelection, selected, selectedError, fingerprint, balance, refreshBalance,
    loadWallet, restoreRecord, clearWallet, lockNow, lock, notice,
    vaultExists, syncVault, confirm, beginBusy,
  };

  return (
    <AppContext.Provider value={state}>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <BsvLogo className="brand-logo" />
            <span className="wordmark">Mnemonic <span>to BRC-100</span></span>
          </div>
          <div className="topbar-right">
            <span className="pill tnum" title={priceNote}>
              <BsvLogo className="bsv-mark" darkGlyph />
              {price ? `$${price.toFixed(2)}` : '—'}
            </span>
            <span className="pill network"><span className="dot" />Mainnet · local</span>
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <section className="intro">
          <div className="eyebrow">Keys stay in your browser</div>
          <h2>Find, recover and move your BSV.</h2>
          <p>Import a phrase from Centbee, RockWallet, ElectrumSV and more, find every funded address, and sweep it into your BRC-100 wallet.</p>
        </section>

        <div className="notice">
          <ShieldAlert size={18} aria-hidden />
          <div><b>Use at your own risk.</b> Preferably run this locally after inspecting the <a href="https://github.com/bsv-blockchain-demos/mnemonic-to-brc100" target="_blank" rel="noopener noreferrer">source code</a>. Never enter a valuable phrase on a shared or untrusted device, and review every transaction before broadcasting. Provided as-is — see <a href="/LICENSE.txt">LICENSE</a>.</div>
        </div>

        <main className="layout">
          <aside className="sidebar">
            <div className="card balance-block">
              <div className="label-caps">Selected address</div>
              <div className="balance-sats">{balance === null ? '—' : fmtSats(balance)} <small>sats</small></div>
              <div className="balance-usd">{balance === null ? '— USD' : fmtUsd(balance, price)}</div>
              {selected && <div className="balance-path mono">{selected.path}</div>}
              <div className="actions">
                <button className="btn btn-secondary btn-sm" disabled={!selected} onClick={() => void refreshBalance()}><RefreshCw size={14} /> Refresh</button>
              </div>
            </div>
            <div className="card">
              <nav className="nav" aria-label="Wallet tools">
                {PANELS.map(({ id, label, caption, icon: Icon }) => (
                  <button key={id} className={panel === id ? 'active' : ''} aria-current={panel === id ? 'page' : undefined} onClick={() => setPanel(id)}>
                    <span className="chip" aria-hidden><Icon size={18} /></span>
                    <span className="nav-text"><span className="nav-label">{label}</span><span className="nav-caption">{caption}</span></span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <section>
            {PANELS.map(({ id, Component }) => (
              <div key={`${id}-${epoch}`} className={`panel${panel === id ? ' active' : ''}`}>
                <Component />
              </div>
            ))}
          </section>
        </main>

        <footer className="footer">
          Mnemonic to BRC-100 · Use at your own risk ·{' '}
          <a href="https://github.com/bsv-blockchain-demos/mnemonic-to-brc100" target="_blank" rel="noopener noreferrer">source</a>
        </footer>
      </div>
      {dialog}
    </AppContext.Provider>
  );
}

export default App;
