import type { ReactNode } from 'react';

/**
 * A flat phone around the explainer: ink bezel, a 9:16 screen and a soft
 * glare, as on the BitcoinSV Wallet site. It sets no transform, filter or
 * z-index, so the player inside can still go full screen with position: fixed.
 */
export function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`phone-frame ${className}`}>
      <div className="phone-screen">{children}</div>
      <span className="phone-glare" aria-hidden />
    </div>
  );
}
