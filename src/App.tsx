import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AppContext, type AppState, type LockState, type Selection, type Session } from './state';
import { createApi } from './lib/net';
import { loadSettings, saveSettings, type Settings } from './lib/settings';
import { DEFAULT_PRESET, addressFingerprint, deriveKey, presetById, rootFromMnemonic, validateMnemonic, validateTemplate } from './lib/derive';
import { localVault, type SeedRecord } from './lib/vault';
import { errorMessage, safeInt } from './lib/format';
import { useAutoLock } from './hooks/useAutoLock';
import { useTheme } from './hooks/useTheme';
import { ArrowUpRight, Clock3, FileLock2, Gem, KeyRound, Moon, ScanSearch, ShieldAlert, SlidersHorizontal, Sun } from 'lucide-react';
import { BsvLogo } from './components/BsvLogo';
import { BalanceCard } from './components/BalanceCard';
import { MobileTabBar } from './components/MobileTabBar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/Tooltip';
import { useConfirmDialog } from './components/ConfirmDialog';
import { WalletPanel } from './components/WalletPanel';
import { SendPanel } from './components/SendPanel';
import { RecoverPanel } from './components/RecoverPanel';
import { TokensPanel } from './components/TokensPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { BackupPanel } from './components/BackupPanel';
import { SettingsPanel } from './components/SettingsPanel';

const PANELS = [
  { id: 'wallet', info: "Enter your seed phrase and pick which wallet app it came from. Your keys are made right here in your browser.", label: 'Wallet', caption: 'Seed phrase & path', icon: KeyRound, Component: WalletPanel },
  { id: 'recover', info: "Checks your addresses on the blockchain for coins, then moves everything it finds into your BRC-100 wallet or any address you choose.", label: 'Recover', caption: 'Find & move your coins', icon: ScanSearch, Component: RecoverPanel },
  { id: 'send', info: "Pay someone from the address selected on the Wallet tab. You review the transaction before anything is sent.", label: 'Send', caption: 'Pay from this address', icon: ArrowUpRight, Component: SendPanel },
  { id: 'tokens', info: "Shows the NFTs (ordinals) and tokens at this address. They are kept out of every payment so you can't spend them by accident.", label: 'Tokens', caption: 'NFTs & tokens', icon: Gem, Component: TokensPanel },
  { id: 'history', info: "Lists past transactions for your addresses, with a link to view each one on the blockchain.", label: 'History', caption: 'Past transactions', icon: Clock3, Component: HistoryPanel },
  { id: 'backup', info: "Saves your phrase locked with a password, so you can unlock later without retyping all the words.", label: 'Backup', caption: 'Password-locked copy', icon: FileLock2, Component: BackupPanel },
  { id: 'settings', info: "Choose where the app gets blockchain data from and how much fee to pay the miners who process your transactions.", label: 'Settings', caption: 'Network & fees', icon: SlidersHorizontal, Component: SettingsPanel },
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
  const [balanceStatus, setBalanceStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [fingerprint, setFingerprint] = useState('');
  const [lock, setLock] = useState<LockState>(NO_LOCK);
  const [notice, setNotice] = useState('');
  const [vaultExists, setVaultExists] = useState(localVault.exists);
  const [panel, setPanel] = useState<string>('wallet');
  const [noticeOpen, setNoticeOpen] = useState(false);

  // On phones a tab switch starts the new panel from the top of the page, so
  // a tap always visibly does something even when scrolled far down.
  const selectPanel = useCallback((id: string) => {
    setPanel(id);
    if (window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }, []);
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
      return { selected: null, selectedError: `Couldn't work out an address from ${selection.template}: ${errorMessage(e)}` };
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
    if (!address) { setBalance(null); setBalanceStatus('idle'); return; }
    setBalanceStatus('loading');
    try {
      const data = await api.woc.balance(address);
      setBalance(Number(data.confirmed || 0) + Number(data.unconfirmed || 0));
      setBalanceStatus('ok');
    } catch {
      setBalance(null);
      setBalanceStatus('error');
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
  // auto-lock. A lock that left the mnemonic in a hidden input would be decoration.
  const wipe = useCallback((message: string) => {
    setSession(null);
    setBalance(null);
    setNotice(message);
    setEpoch(e => e + 1);
  }, []);

  const engageLock = useCallback((reason: string) => {
    wipe('Wallet locked. Your keys were wiped from this page.');
    setLock({ engaged: true, reason });
    setPanel('wallet');
  }, [wipe]);

  const clearWallet = useCallback(() => {
    setLock(NO_LOCK);
    wipe('Wallet cleared from this page.');
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
      <TooltipProvider>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <BsvLogo className="brand-logo" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="wordmark" tabIndex={0}>Derivation <span>Path</span></span>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                A derivation path, like m/44'/0'/0'/0/0, is the route a wallet follows from your seed phrase to each address. Different wallets use different paths, so the same phrase can hold funds at many of them.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="topbar-right">
            <span className="pill tnum" title={priceNote}>
              <BsvLogo className="bsv-mark" darkGlyph />
              {price ? `$${price.toFixed(2)}` : '-'}
            </span>
            <span className="pill network"><span className="dot" />Mainnet · local</span>
            <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <section className="intro">
          <h2>Find, recover and move your BSV.</h2>
          <p>Enter a seed phrase from Centbee, RockWallet, ElectrumSV or another wallet. We find every address with coins and move them into your BRC-100 wallet.</p>
        </section>

        <div className={`notice${noticeOpen ? ' open' : ''}`}>
          <ShieldAlert size={18} aria-hidden />
          <div>
            <b>Use at your own risk.</b>{' '}
            <button type="button" className="notice-toggle" aria-expanded={noticeOpen} onClick={() => setNoticeOpen(o => !o)}>{noticeOpen ? 'Less' : 'More'}</button>
            <span className="notice-more"> For the safest setup, run this on your own computer after checking the <a href="https://github.com/bsv-blockchain-demos/mnemonic-to-brc100" target="_blank" rel="noopener noreferrer">source code</a>.<br />Only type your seed phrase on a device you trust, and check every transaction before you send it. Provided as-is, see <a href="/LICENSE.txt">LICENSE</a>.</span>
          </div>
        </div>

        <main className="layout">
          <aside className="sidebar">
            <div className="card nav-card">
              <nav className="nav" aria-label="Wallet tools">
                {PANELS.map(({ id, label, caption, info, icon: Icon }) => (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                      <button className={panel === id ? 'active' : ''} aria-current={panel === id ? 'page' : undefined} onClick={() => selectPanel(id)}>
                        <span className="chip" aria-hidden><Icon size={18} /></span>
                        <span className="nav-text"><span className="nav-label">{label}</span><span className="nav-caption">{caption}</span></span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10} className="nav-tooltip">{info}</TooltipContent>
                  </Tooltip>
                ))}
              </nav>
            </div>
            <BalanceCard
              address={selected?.address ?? null}
              path={selected?.path ?? null}
              balance={balance}
              status={balanceStatus}
              price={price}
              onRefresh={() => void refreshBalance()}
              onEnterPhrase={() => {
                selectPanel('wallet');
                requestAnimationFrame(() => document.getElementById('mnemonicInput')?.focus());
              }}
              onScan={() => selectPanel('recover')}
            />
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
          Derivation Path · Use at your own risk
        </footer>
      </div>
      <MobileTabBar items={PANELS.map(({ id, label, caption, icon }) => ({ id, label, caption, icon }))} primaryCount={4} active={panel} onSelect={selectPanel} />
      {dialog}
      </TooltipProvider>
    </AppContext.Provider>
  );
}

export default App;
