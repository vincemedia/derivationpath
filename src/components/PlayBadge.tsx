import { Loader2, Play, RotateCcw } from 'lucide-react';

/**
 * The big play button: a white disc with a black icon, a deep soft shadow,
 * and two rings pulsing out behind it to invite a tap (not with reduced motion).
 */
export function PlayBadge({ state = 'play', size = 'lg' }: {
  state?: 'play' | 'replay' | 'loading';
  size?: 'md' | 'lg';
}) {
  const icon = size === 'lg' ? 34 : 26;
  return (
    <span className={`play-badge play-badge-${size}`} aria-hidden>
      {state !== 'loading' && <><span className="play-badge-ring" /><span className="play-badge-ring" /></>}
      <span className="play-badge-disc">
        {state === 'loading' ? <Loader2 size={icon} className="spin" />
          : state === 'replay' ? <RotateCcw size={icon} />
          : <Play size={icon} className="play-badge-play" fill="currentColor" strokeWidth={0} />}
      </span>
    </span>
  );
}
