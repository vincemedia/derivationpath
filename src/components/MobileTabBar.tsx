import { useState } from 'react';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export interface TabItem {
  id: string;
  label: string;
  caption: string;
  icon: LucideIcon;
}

/**
 * Bottom tab bar for phones (hidden above 900px, where the sidebar nav shows).
 * The first `primaryCount` items get their own tab; the rest live under More,
 * in a small popover that also carries each item's one-line caption, since
 * hover tooltips don't exist on touch.
 */
export function MobileTabBar({ items, primaryCount, active, onSelect }: {
  items: TabItem[];
  primaryCount: number;
  active: string;
  onSelect: (id: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.slice(0, primaryCount);
  const more = items.slice(primaryCount);
  const moreActive = more.some(i => i.id === active);

  const tab = (id: string, label: string, Icon: LucideIcon, isActive: boolean, onClick: () => void) => (
    <button key={id} type="button" className={`tab${isActive ? ' active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={onClick}>
      <span className="tab-icon" aria-hidden><Icon size={20} /></span>
      <span className="tab-label">{label}</span>
    </button>
  );

  return (
    <nav className="tabbar" aria-label="Wallet tools">
      {primary.map(i => tab(i.id, i.label, i.icon, i.id === active, () => onSelect(i.id)))}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={`tab${moreActive ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={moreOpen}>
            <span className="tab-icon" aria-hidden><Ellipsis size={20} /></span>
            <span className="tab-label">More</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" sideOffset={10} className="more-popover">
          <div role="menu">
            {more.map(({ id, label, caption, icon: Icon }) => (
              <button key={id} type="button" role="menuitem" className={`command-item select-option${id === active ? ' current' : ''}`}
                onClick={() => { onSelect(id); setMoreOpen(false); }}>
                <span className="wallet-icon wallet-icon-glyph more-icon" aria-hidden><Icon size={15} /></span>
                <span className="command-item-text">
                  <span>{label}</span>
                  <span className="select-option-detail">{caption}</span>
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  );
}
