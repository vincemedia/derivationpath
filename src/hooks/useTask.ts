import { useCallback, useRef, useState } from 'react';
import { useApp } from '../state';
import { errorMessage } from '../lib/format';

export type StatusType = '' | 'success' | 'error' | 'warn';
export interface StatusState { text: string; type: StatusType }

/**
 * Status line + busy flag for a panel. `run` routes thrown errors to the
 * status line and holds off auto-lock while the task is in flight.
 */
export function useTask(initial: string) {
  const { beginBusy } = useApp();
  const [status, setStatusState] = useState<StatusState>({ text: initial, type: '' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const setStatus = useCallback((text: string, type: StatusType = '') => setStatusState({ text, type }), []);

  const run = useCallback(async (fn: () => Promise<void> | void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const release = beginBusy();
    try {
      await fn();
    } catch (e) {
      setStatus(errorMessage(e), 'error');
    } finally {
      release();
      busyRef.current = false;
      setBusy(false);
    }
  }, [beginBusy, setStatus]);

  return { status, setStatus, busy, run };
}
