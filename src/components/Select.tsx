import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional bold name shown before the label, e.g. the active wallet. */
  prefix?: string;
  /** Optional second line, e.g. what the option means. */
  detail?: string;
  icon?: ReactNode;
}

/**
 * shadcn-style select: a popover listbox in place of a native <select>, so
 * options can carry icons and a short explanation. Arrow keys move between
 * options, Enter/Space picks one, Esc closes.
 */
export function Select<T extends string>({ id, value, options, onChange, disabled }: {
  id: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value) ?? options[0];

  const pick = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  const focusOption = (delta: number) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + delta + items.length) % items.length]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusOption(-1); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" className="select-trigger" disabled={disabled}>
          {current.icon}
          <span className="select-trigger-value">{current.prefix ? <><b>{current.prefix}</b> <span className="select-prefixed">{current.label}</span></> : current.label}</span>
          <ChevronsUpDown size={16} className="select-trigger-chevron" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="select-popover"
        onOpenAutoFocus={e => {
          // Land on the chosen option, like a native select.
          e.preventDefault();
          listRef.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus();
        }}
      >
        <div ref={listRef} role="listbox" aria-labelledby={id} onKeyDown={onKeyDown}>
          {options.map(o => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} className="command-item select-option" onClick={() => pick(o.value)}>
              {o.icon}
              <span className="command-item-text">
                <span>{o.prefix ? <><b>{o.prefix}</b> <span className="select-prefixed">{o.label}</span></> : o.label}</span>
                {o.detail && <span className="select-option-detail">{o.detail}</span>}
              </span>
              <Check size={16} className="command-item-check" style={{ opacity: o.value === value ? 1 : 0 }} aria-hidden />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A lucide icon in the same round 24px badge as the wallet logos. */
export function OptionIcon({ children }: { children: ReactNode }) {
  return <span className="wallet-icon wallet-icon-glyph" aria-hidden>{children}</span>;
}
