import { useEffect, useRef, useState } from 'react';
import { EXPLAINER } from '../lib/explainer';

/**
 * The explainer's subtitles, drawn over the video rather than baked into it.
 * The sentence being spoken sits on dark bars, one per line, two lines at
 * most; the second joins when the voice reaches it, and the word being spoken
 * lights up white. They pause while a title card is on screen (the title says
 * it). Ported from the BitcoinSV Wallet tour; only the highlight differs.
 */

type Word = { w: string; t: number; e: number };
type Page = { start: number; end: number; lines: Word[][] };
type Captions = { duration: number; hide: [number, number][]; pages: Page[] };

const NOTHING = { page: -1, lines: 0, word: -1 };

/** What's on screen at time t: the subtitle, how many of its lines, and the lit word. */
function stateAt(data: Captions | null, t: number) {
  if (!data || data.hide.some(([a, b]) => t >= a && t < b)) return NOTHING;
  const page = data.pages.findIndex(p => t >= p.start && t < p.end);
  if (page < 0) return NOTHING;
  const p = data.pages[page];
  const words = p.lines.flat();
  // a line joins just before the voice reaches it; a word is lit until the next begins
  const lines = p.lines.filter(l => t >= l[0].t - 0.05).length;
  const word = words.findIndex((w, i) => t >= w.t && t < (words[i + 1]?.t ?? w.e + 0.15));
  return { page, lines, word };
}

/** A missing or half-written file shows no subtitles rather than breaking the player. */
function isCaptions(d: unknown): d is Captions {
  const c = d as Captions | null;
  return !!c && Array.isArray(c.pages) && Array.isArray(c.hide);
}

export function ExplainerSubtitles({ video }: { video: HTMLVideoElement | null }) {
  const [data, setData] = useState<Captions | null>(null);
  // re-rendered only when something visible changes, not every frame
  const [now, setNow] = useState(NOTHING);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch(EXPLAINER.captions)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live && isCaptions(d)) setData(d); })
      .catch(() => { /* no captions file yet: nothing to show */ });
    return () => { live = false; };
  }, []);

  // follow the video's clock every frame, so the highlight lands on time
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const next = stateAt(data, video.currentTime);
      const key = `${next.page}:${next.lines}:${next.word}`;
      if (key !== last) {
        last = key;
        setNow(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video, data]);

  // the video's own 9:16 area inside the player (letterboxed when full screen)
  useEffect(() => {
    const el = frame.current?.parentElement;
    if (!el) return;
    const fit = () => {
      const w = Math.min(el.clientWidth, (el.clientHeight * 9) / 16);
      setBox({ w, h: (w * 16) / 9 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = data && now.page >= 0 ? data.pages[now.page] : undefined;
  const words = page?.lines.flat() ?? [];

  return (
    <div ref={frame} className="subs" aria-hidden style={{ width: box.w, height: box.h }}>
      {page && (
        <div className="subs-lines">
          {page.lines.map((line, i) => (
            // a line joins when the voice reaches it
            <div key={`${now.page}-${i}`} className={`subs-line${i < now.lines ? ' shown' : ''}`}>
              {line.map((w, j) => (
                <span key={`${w.t}-${w.w}`}>
                  {j > 0 && ' '}
                  <span className={`subs-word${words.indexOf(w) === now.word ? ' on' : ''}`}>{w.w}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
