import { createContext, useContext } from 'react';
import type { HD } from '@bsv/sdk';
import type { Api } from './lib/net';
import type { Settings } from './lib/settings';
import type { DerivedKey } from './lib/derive';
import type { SeedRecord } from './lib/vault';

export interface Session {
  mnemonic: string;
  passphrase: string;
  root: HD;
}

export interface Selection {
  presetId: string;
  template: string;
  chain: number;
  index: number;
}

export interface LockState {
  engaged: boolean;
  reason: string;
}

export interface AppState {
  settings: Settings;
  updateSettings: (s: Settings) => void;
  api: Api;
  price: number;
  reloadPrice: () => Promise<void>;

  session: Session | null;
  selection: Selection;
  setSelection: (s: Selection) => void;
  selected: DerivedKey | null;
  selectedError: string;
  fingerprint: string;
  balance: number | null;
  refreshBalance: () => Promise<void>;

  /** Validates, derives the root and replaces the session. Throws on bad input. */
  loadWallet: (mnemonic: string, passphrase: string, notice: string, selection?: Selection) => void;
  restoreRecord: (record: SeedRecord, notice: string) => void;
  clearWallet: () => void;
  lockNow: () => void;
  lock: LockState;
  notice: string;

  vaultExists: boolean;
  syncVault: () => void;

  confirm: (title: string, text: string) => Promise<boolean>;
  /** Marks long-running work so auto-lock waits for it. Returns the release function. */
  beginBusy: () => () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
