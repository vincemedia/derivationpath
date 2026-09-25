import { KeyRound, Loader2, RefreshCw, ScanSearch, WifiOff } from 'lucide-react';
import { fmtSats, fmtUsd } from '../lib/format';

const STEPS = [
  'Pick the wallet app you used',
  'Scan for coins on Recover',
  'Move them to your wallet',
];

/**
 * Balance of the selected address. With no wallet loaded it explains the
 * three-step flow instead of showing empty dashes; at zero it points to a
 * full scan, since coins usually sit at other addresses.
 */
export function BalanceCard({ address, path, balance, status, price, onRefresh, onGetStarted, onScan }: {
  address: string | null;
  path: string | null;
  balance: number | null;
  status: 'idle' | 'loading' | 'ok' | 'error';
  price: number;
  onRefresh: () => void;
  onGetStarted: () => void;
  onScan: () => void;
}) {
  if (!address) {
    return (
      <div className="card balance-block balance-empty">
        <div className="label-caps">How it works</div>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step}><span className="step-num">{i + 1}</span>{step}</li>
          ))}
        </ol>
        <div className="actions balance-cta">
          <button className="btn btn-primary btn-sm" onClick={onGetStarted}><KeyRound size={14} /> Get started</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card balance-block">
      <div className="label-caps">Selected address</div>
      <div className="balance-main">
      {status === 'loading' && balance === null ? (
        <div className="balance-state"><Loader2 size={16} className="spin" /> Checking balance…</div>
      ) : status === 'error' ? (
        <div className="balance-state"><WifiOff size={16} /> Couldn't load the balance. Try again.</div>
      ) : (
        <>
          <div className="balance-sats">{fmtSats(balance ?? 0)} <small>sats</small></div>
          <div className="balance-usd">{fmtUsd(balance ?? 0, price)}</div>
        </>
      )}
      </div>
      <div className="balance-path mono">{path}</div>
      {status === 'ok' && balance === 0 && (
        <p className="balance-hint">Nothing here. Your coins may be at other addresses from the same phrase.</p>
      )}
      <div className="actions balance-actions">
        {status === 'ok' && balance === 0 && (
          <button className="btn btn-primary btn-sm" onClick={onScan}><ScanSearch size={14} /> Scan all<span className="btn-text"> addresses</span></button>
        )}
        <button className="btn btn-secondary btn-sm" disabled={status === 'loading'} onClick={onRefresh} aria-label="Refresh balance"><RefreshCw size={14} /><span className="btn-text"> Refresh</span></button>
      </div>
    </div>
  );
}
