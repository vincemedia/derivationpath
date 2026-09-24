import { useEffect, useRef } from 'react';

export const LOCK_IDLE_MS = 10 * 60 * 1000;
// A backgrounded tab still locks, but survives a glance at an explorer link
// (target="_blank" hides this tab) while reviewing a transaction.
export const LOCK_HIDDEN_GRACE_MS = 60 * 1000;

/**
 * Calls onLock after LOCK_IDLE_MS without interaction, or LOCK_HIDDEN_GRACE_MS
 * with the tab hidden. While `busyRef.current > 0` (a scan or broadcast is in
 * flight) the lock is deferred rather than pulling keys out from under it.
 */
export function useAutoLock(active: boolean, onLock: (reason: string) => void, busyRef: React.RefObject<number>) {
  const onLockRef = useRef(onLock);
  useEffect(() => { onLockRef.current = onLock; }, [onLock]);

  useEffect(() => {
    if (!active) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let hidden: ReturnType<typeof setTimeout> | undefined;

    const fire = (reason: string) => {
      if (busyRef.current > 0) { armIdle(); return; }
      onLockRef.current(reason);
    };
    const armIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => fire(`${LOCK_IDLE_MS / 60000} minutes of inactivity`), LOCK_IDLE_MS);
    };
    const onVisibility = () => {
      clearTimeout(hidden);
      if (document.visibilityState === 'hidden') {
        hidden = setTimeout(() => fire('the tab was left in the background'), LOCK_HIDDEN_GRACE_MS);
      } else {
        armIdle();
      }
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'focus', 'click', 'scroll'] as const;
    // Passive: these fire constantly and must never block scrolling.
    events.forEach(ev => window.addEventListener(ev, armIdle, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    armIdle();
    return () => {
      clearTimeout(idle);
      clearTimeout(hidden);
      events.forEach(ev => window.removeEventListener(ev, armIdle));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, busyRef]);
}
