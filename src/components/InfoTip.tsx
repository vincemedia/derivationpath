import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

const CLOSE_DELAY_MS = 150;

/**
 * (i) button with a short explainer in a shadcn popover. Opens on hover for
 * mouse users; a click pins it open (and is the only way on touch). Esc or
 * clicking outside closes it.
 */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const hoverOpen = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || pinned) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setPinned(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="info-btn"
          aria-label={`About ${title}`}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onClick={(e) => {
            // Radix toggles on click; a click while hover-opened should pin instead of closing.
            if (open && !pinned) { e.preventDefault(); setPinned(true); return; }
            setPinned(!open);
          }}
        >
          <Info size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="info-popover" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}
        onOpenAutoFocus={e => e.preventDefault()}>
        <strong>{title}</strong>
        <p>{children}</p>
      </PopoverContent>
    </Popover>
  );
}

/** A form label with an (i) explainer beside it. */
export function LabelWithInfo({ htmlFor, label, info }: { htmlFor?: string; label: ReactNode; info: ReactNode }) {
  return (
    <div className="label-row">
      <label htmlFor={htmlFor}>{label}</label>
      <InfoTip title={typeof label === 'string' ? label : 'this field'}>{info}</InfoTip>
    </div>
  );
}
