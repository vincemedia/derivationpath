import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Pending { title: string; text: string; resolve: (v: boolean) => void }

/** Promise-based modal confirm. Esc / backdrop close reads as "cancel". */
export function useConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const confirm = useCallback((title: string, text: string) =>
    new Promise<boolean>(resolve => setPending({ title, text, resolve })), []);

  useEffect(() => {
    if (pending && ref.current && !ref.current.open) ref.current.showModal();
  }, [pending]);

  const done = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
    ref.current?.close();
  };

  const dialog = (
    <dialog ref={ref} onClose={() => pending && done(false)}>
      <div className="dialog-head"><span className="chip" aria-hidden><ShieldAlert size={20} /></span><h3>{pending?.title ?? 'Confirm action'}</h3></div>
      <div className="dialog-body">
        <p>{pending?.text}</p>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => done(false)} autoFocus>Cancel</button>
          <button className="btn btn-ink" onClick={() => done(true)}>Confirm</button>
        </div>
      </div>
    </dialog>
  );

  return { confirm, dialog };
}
