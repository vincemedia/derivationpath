import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { useApp } from '../state';
import { explorerHref } from '../lib/settings';
import type { StatusState } from '../hooks/useTask';

const STATUS_ICONS: Record<StatusState['type'], LucideIcon> = {
  '': Info,
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
};

// Rendered as text, never HTML: messages carry API-supplied strings.
export function Status({ status }: { status: StatusState }) {
  const Icon = STATUS_ICONS[status.type];
  return (
    <div className={`status ${status.type}`.trim()} role="status">
      <Icon size={16} aria-hidden />
      <span>{status.text}</span>
    </div>
  );
}

export function SectionTitle({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="section-title">
      {Icon && <span className="chip" aria-hidden><Icon size={20} /></span>}
      <div><h3>{title}</h3>{children && <p>{children}</p>}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="label-caps section-label">{children}</div>;
}

export function TxLink({ txid, label }: { txid: string; label?: string }) {
  const { settings } = useApp();
  const href = explorerHref(settings, txid);
  const text = label ?? txid;
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{text}</a> : <span>{text}</span>;
}

export function Empty({ icon: Icon = Info, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="chip" aria-hidden><Icon size={20} /></span>
      <span>{children}</span>
    </div>
  );
}
