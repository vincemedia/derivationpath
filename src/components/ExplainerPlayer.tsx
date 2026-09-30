import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { Captions, CaptionsOff, ChevronDown, KeyRound, Loader2, Maximize2, Pause, Play, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { EXPLAINER, explainerSource, fmtClock } from '../lib/explainer';
import { ExplainerSubtitles } from './ExplainerSubtitles';
import { PhoneFrame } from './PhoneFrame';
import { PlayBadge } from './PlayBadge';

export interface ExplainerHandle {
  play: () => void;
}

/** Subtitles on or off, remembered per browser. */
const SUBS_KEY = 'dp-explainer-subtitles';
let subsFallback = true;
const subsListeners = new Set<() => void>();
function readSubs(): boolean {
  try {
    const v = localStorage.getItem(SUBS_KEY);
    return v === null ? subsFallback : v === '1';
  } catch {
    return subsFallback;
  }
}
function writeSubs(on: boolean) {
  subsFallback = on;
  try { localStorage.setItem(SUBS_KEY, on ? '1' : '0'); } catch { /* private mode: just for now */ }
  subsListeners.forEach(l => l());
}
function subscribeSubs(l: () => void) {
  subsListeners.add(l);
  return () => { subsListeners.delete(l); };
}

/** iOS ignores video.volume (the hardware buttons own it), so no slider there. */
let volumeSettable: boolean | null = null;
function canSetVolume(): boolean {
  if (volumeSettable === null) {
    const a = document.createElement('audio');
    a.volume = 0.5;
    volumeSettable = a.volume === 0.5;
  }
  return volumeSettable;
}
const noop = () => () => {};

/** Same breakpoint as the tab bar: at or below it the player opens full screen. */
const PHONE_QUERY = '(max-width: 900px)';
function subscribePhone(l: () => void) {
  const m = window.matchMedia(PHONE_QUERY);
  m.addEventListener('change', l);
  return () => m.removeEventListener('change', l);
}
const readPhone = () => window.matchMedia(PHONE_QUERY).matches;

type Mode = 'inline' | 'full' | 'mini';

/**
 * The explainer in a phone. On a desktop it plays right there, with sound,
 * word-lit subtitles and its own controls. On a phone a tap opens it full
 * screen; the chevron shrinks it to a small player in the corner that keeps
 * playing while you use the tool, and Skip closes it. One <video> throughout,
 * restyled rather than moved, so shrinking never restarts it.
 */
export function ExplainerPlayer({ ref, onStartRecovering }: {
  ref?: Ref<ExplainerHandle>;
  onStartRecovering: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  const phone = useSyncExternalStore(subscribePhone, readPhone, () => false);
  const [mode, setMode] = useState<Mode>('inline');
  // full screen and the corner player are for phones; a wide window always plays in the phone
  const shown: Mode = phone ? mode : 'inline';
  const shownRef = useRef(shown);
  useEffect(() => { shownRef.current = shown; }, [shown]);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  // true from pressing play until frames actually move
  const [waiting, setWaiting] = useState(false);
  // the browser wouldn't start it at all, even muted: a big play button, which it always allows
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const slider = useSyncExternalStore(noop, canSetVolume, () => false);
  const subs = useSyncExternalStore(subscribeSubs, readSubs, () => true);
  // the file is chosen per browser and only set once we decide to load it
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => setEl(video.current), []);
  // set on the element directly: React doesn't keep the muted property in step
  useEffect(() => { if (video.current) video.current.muted = muted; }, [muted]);

  const heard = muted ? 0 : volume;
  const changeVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
    if (video.current) video.current.volume = v;
  };
  const toggleMute = () => {
    // unmuting from a slider at zero brings the sound back at a sensible level
    if (muted && volume === 0) changeVolume(0.6);
    else setMuted(m => !m);
  };

  const play = (at?: number) => {
    const v = video.current;
    if (!v) return;
    // no file yet, or it already failed while preloading (an errored element never retries by itself)
    if (!v.getAttribute('src') || v.error) {
      const chosen = v.error ? EXPLAINER.mp4 : explainerSource();
      v.src = chosen; // set now, inside the click, so play() has something to play
      setSrc(chosen);
    }
    if (at !== undefined) v.currentTime = at;
    if (phone && mode === 'inline') setMode('full');
    setStarted(true);
    setEnded(false);
    setBlocked(false);
    setFailed(false);
    setWaiting(true);
    v.play().catch((err: DOMException) => {
      if (err?.name !== 'NotAllowedError') return;
      // a browser that refuses sound still plays muted (the sound button unmutes it)
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {
        setWaiting(false);
        setBlocked(true);
      });
    });
  };
  useImperativeHandle(ref, () => ({ play: () => play() }));

  const togglePlay = () => (playing ? video.current?.pause() : play());

  // the big play button after a refused autoplay: a real tap, so sound is allowed
  const unblock = () => {
    setMuted(false);
    if (video.current) video.current.muted = false;
    play();
  };

  // Skip: back into the phone, paused where it was, so a second tap picks it up again
  const close = () => {
    video.current?.pause();
    setMode('inline');
    setStarted(false);
    setEnded(false);
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  };

  const startRecovering = () => {
    if (shown !== 'inline') {
      setMode('inline');
      setStarted(false);
      setEnded(false);
      setTime(0);
      if (video.current) video.current.currentTime = 0;
    }
    onStartRecovering();
  };

  /*
   * Preload in stages: the poster when the player is about three screens
   * away, the whole file at two, so pressing play never waits on the network.
   * On Save-Data or 2G we hold off until the pointer or focus reaches it.
   */
  const [preload, setPreload] = useState<'none' | 'auto'>('none');
  const [near, setNear] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) setNear(true); }, { rootMargin: '300% 0px' });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  const warm = () => {
    setPreload('auto');
    setSrc(s => s ?? explainerSource());
  };
  useEffect(() => {
    const v = video.current;
    if (!v || preload === 'auto') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      setPreload('auto');
      setSrc(s => s ?? explainerSource());
    }, { rootMargin: '200% 0px' });
    io.observe(v);
    return () => io.disconnect();
  }, [preload]);

  // pause when the phone is scrolled away (the full-screen and corner players stay in view)
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting && shownRef.current === 'inline') v.pause();
    }, { threshold: 0.2 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  // Full screen is a modal: the page stops scrolling, Escape closes it, and Tab stays inside.
  useEffect(() => {
    if (shown !== 'full') return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    skip.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        video.current?.pause();
        setMode('inline');
        setStarted(false);
        setEnded(false);
        requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
        return;
      }
      if (e.key !== 'Tab' || !root.current) return;
      const items = [...root.current.querySelectorAll<HTMLElement>('button, input')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = before;
      document.removeEventListener('keydown', onKey);
    };
  }, [shown]);

  const length = fmtClock(duration ?? 120);
  const progress = time / (duration || EXPLAINER.fallbackDuration);
  const resume = time > 1 && !ended;

  const soundControls = (
    <div className="xp-sound">
      <button type="button" className="xp-btn" onClick={toggleMute} aria-label={muted ? 'Sound on' : 'Sound off'}>
        {heard === 0 ? <VolumeX size={17} /> : heard < 0.5 ? <Volume1 size={17} /> : <Volume2 size={17} />}
      </button>
      {slider && (
        <input type="range" className="xp-volume" min={0} max={1} step={0.05} value={heard}
          onChange={e => changeVolume(Number(e.target.value))} aria-label="Volume" />
      )}
    </div>
  );
  const playButton = (
    <button type="button" className="xp-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
      {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="xp-play-icon" />}
    </button>
  );
  const subsButton = (
    <button type="button" className="xp-btn" aria-pressed={subs} onClick={() => writeSubs(!subs)} aria-label={subs ? 'Hide subtitles' : 'Show subtitles'}>
      {subs ? <Captions size={17} /> : <CaptionsOff size={17} />}
    </button>
  );

  return (
    <div className="explainer" onPointerEnter={warm} onFocus={warm} onTouchStart={warm}>
      <PhoneFrame>
        {/* the still stays in the phone while the player is full screen or in the corner */}
        {near && <span className="xp-still" style={{ backgroundImage: `url(${EXPLAINER.poster})` }} aria-hidden />}
        <div
          ref={root}
          className={`xp is-${shown}`}
          role={shown === 'inline' ? undefined : 'dialog'}
          aria-modal={shown === 'full' ? true : undefined}
          aria-label={shown === 'inline' ? undefined : 'Explainer video'}
        >
          <video
            ref={video}
            className="xp-video"
            poster={preload === 'auto' || near ? EXPLAINER.poster : undefined}
            playsInline
            preload={preload}
            src={src ?? undefined}
            onClick={shown === 'mini' ? undefined : togglePlay}
            onPlay={() => { setPlaying(true); setEnded(false); setBlocked(false); }}
            onPlaying={() => { setWaiting(false); setFailed(false); }}
            onWaiting={() => { if (started) setWaiting(true); }}
            onPause={() => { setPlaying(false); setWaiting(false); }}
            onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuration(d); }}
            onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
            onError={e => {
              // a WebM this browser can't decode after all: fall back to MP4
              const v = e.currentTarget;
              if (src && src !== EXPLAINER.mp4) {
                setSrc(EXPLAINER.mp4);
                v.src = EXPLAINER.mp4;
                if (started) v.play().catch(() => setWaiting(false));
              } else {
                setWaiting(false);
                if (started) setFailed(true);
              }
            }}
            onEnded={() => {
              setPlaying(false);
              setEnded(true);
              // in the corner it would go unseen
              if (shownRef.current === 'mini') setMode('full');
            }}
            aria-label="Explainer: how a seed phrase and a derivation path find your coins, in two minutes"
          >
            <track kind="captions" src={EXPLAINER.vtt} srcLang="en" label="English" />
          </video>

          {/* subtitles over the video, not baked in; too small to read in the corner */}
          {subs && started && !ended && shown !== 'mini' && <ExplainerSubtitles video={el} />}

          {started && waiting && !ended && !blocked && (
            <span className="xp-cover xp-loading" role="status" aria-label="Loading the video">
              {shown === 'mini' ? <Loader2 size={22} className="spin" /> : <PlayBadge state="loading" size={phone ? 'md' : 'lg'} />}
            </span>
          )}
          {failed && shown !== 'mini' && (
            <span className="xp-cover xp-failed" role="status">The video couldn't load. Please try again later.</span>
          )}

          {ended && shown !== 'mini' ? (
            // at the end: watch again, or go and recover
            <div className="xp-cover xp-end">
              <button type="button" className="xp-badge-btn" onClick={() => play(0)}>
                <PlayBadge state="replay" size={phone ? 'md' : 'lg'} />
                <span className="xp-badge-title">Watch again</span>
              </button>
              <button type="button" className="xp-cta" onClick={startRecovering}>
                <KeyRound size={16} /> Start recovering
              </button>
            </div>
          ) : !started ? (
            <button ref={opener} type="button" className="xp-cover xp-badge-btn xp-start" onClick={() => play()}>
              <PlayBadge state="play" size={phone ? 'md' : 'lg'} />
              <span className="xp-badge-title">{resume ? 'Keep watching' : 'Watch the explainer'}</span>
              <span className="xp-badge-meta">{resume ? `${fmtClock(time)} of ${length}` : `${length} · with sound`}</span>
            </button>
          ) : blocked ? (
            <button type="button" className="xp-cover xp-badge-btn" onClick={unblock} aria-label="Play the explainer">
              <PlayBadge state="play" size={phone ? 'md' : 'lg'} />
            </button>
          ) : null}

          {started && shown === 'inline' && !ended && (
            <div className="xp-bar xp-bar-top">
              {soundControls}
              <span className="xp-spacer" />
              {playButton}
              {subsButton}
            </div>
          )}

          {started && shown === 'full' && (
            <>
              <div className="xp-bar xp-bar-top xp-bar-full">
                <button ref={skip} type="button" className="xp-skip" onClick={close}>Skip</button>
                <span className="xp-spacer" />
                {subsButton}
                <button type="button" className="xp-btn" onClick={() => setMode('mini')} aria-label="Minimise to picture in picture">
                  <ChevronDown size={19} />
                </button>
              </div>
              {!ended && (
                <div className="xp-bar xp-bar-bottom">
                  {playButton}
                  {soundControls}
                  <span className="xp-spacer" />
                  <span className="xp-time tnum">{fmtClock(time)} / {length}</span>
                </div>
              )}
            </>
          )}

          {started && shown === 'mini' && (
            <>
              {/* the whole corner player expands; the X closes it */}
              <button type="button" className="xp-cover xp-expand" onClick={() => setMode('full')} aria-label="Expand the explainer">
                <span className="xp-mini-btn"><Maximize2 size={14} /></span>
              </button>
              <button type="button" className="xp-mini-btn xp-mini-close" onClick={close} aria-label="Close the explainer">
                <X size={14} />
              </button>
            </>
          )}

          {started && (
            <span className="xp-progress" aria-hidden>
              <span style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
            </span>
          )}
        </div>
      </PhoneFrame>
    </div>
  );
}
