import type { ComponentProps } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

// shadcn/ui popover, as used in the BitcoinSV Wallet, with its Tailwind
// classes ported to .popover-content in App.css.

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = 'center', sideOffset = 4, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={`popover-content${className ? ` ${className}` : ''}`} {...props} />
    </PopoverPrimitive.Portal>
  );
}
