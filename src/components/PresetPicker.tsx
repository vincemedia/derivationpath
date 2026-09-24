import { useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, History, PenLine, Search, Waypoints } from 'lucide-react';
import { PRESETS, presetById, type Preset } from '../lib/derive';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

const CUSTOM = 'custom';

/** Wallet logo, or a lettered/icon badge for wallets without one and for standards. */
export function WalletIcon({ preset }: { preset?: Preset }) {
  if (!preset) return <span className="wallet-icon wallet-icon-glyph" aria-hidden><PenLine size={13} /></span>;
  if (preset.icon) {
    return <img className={`wallet-icon${preset.icon.endsWith('.svg') ? ' wallet-icon-dark' : ''}`} src={`${import.meta.env.BASE_URL}wallets/${preset.icon}`} alt="" aria-hidden />;
  }
  if (preset.group === 'wallet') return <span className="wallet-icon wallet-icon-letter" aria-hidden>{preset.name[0]}</span>;
  const Icon = preset.id.startsWith('legacy') ? History : Waypoints;
  return <span className="wallet-icon wallet-icon-glyph" aria-hidden><Icon size={13} /></span>;
}

function Item({ value, keywords, selected, onSelect, preset, name, detail }: {
  value: string; keywords: string[]; selected: boolean; onSelect: () => void;
  preset?: Preset; name: string; detail: string;
}) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className="command-item">
      <WalletIcon preset={preset} />
      <span className="command-item-text">
        <span>{name}</span>
        <span className="command-item-detail">{detail}</span>
      </span>
      <Check size={16} className="command-item-check" style={{ opacity: selected ? 1 : 0 }} aria-hidden />
    </Command.Item>
  );
}

/** shadcn-style combobox (Popover + Command) for choosing a wallet preset. */
export function PresetPicker({ id, value, onChange }: { id: string; value: string; onChange: (presetId: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = presetById(value);
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const group = (g: Preset['group']) => PRESETS.filter(p => p.group === g).map(p => (
    <Item key={p.id} value={p.id} keywords={[p.name, p.template]} selected={p.id === value} onSelect={() => choose(p.id)}
      preset={p} name={p.name} detail={p.template} />
  ));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" className="select-trigger">
          <WalletIcon preset={current} />
          <span className="select-trigger-value">{current ? current.name : 'Custom path'}</span>
          <ChevronsUpDown size={16} className="select-trigger-chevron" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="preset-popover">
        <Command className="command" loop>
          <div className="command-input-wrap">
            <Search size={15} aria-hidden />
            <Command.Input className="command-input" placeholder="Search wallets or paths…" />
          </div>
          <Command.List className="command-list">
            <Command.Empty className="command-empty">No wallet found.</Command.Empty>
            <Command.Group heading="Wallets" className="command-group">{group('wallet')}</Command.Group>
            <Command.Separator className="command-separator" />
            <Command.Group heading="Standards & legacy" className="command-group">
              {group('standard')}
              <Item value={CUSTOM} keywords={['custom', 'path', 'template']} selected={value === CUSTOM} onSelect={() => choose(CUSTOM)}
                name="Custom path" detail="Type any template" />
            </Command.Group>
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
