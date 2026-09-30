/**
 * The explainer video's files (made by video/, served from public/videos).
 * WebM (VP9 + Opus) is smaller, but only where it is fully supported;
 * Safari gets the H.264/AAC MP4, which every browser plays.
 */
export const EXPLAINER = {
  webm: '/videos/explainer.webm',
  mp4: '/videos/explainer.mp4',
  poster: '/videos/explainer-poster.jpg',
  captions: '/videos/explainer-captions.json',
  vtt: '/videos/explainer.vtt',
  // used until the file's own duration is known
  fallbackDuration: 118,
} as const;

export function explainerSource(): string {
  if (typeof document === 'undefined') return EXPLAINER.mp4;
  const safari = /^((?!chrome|chromium|crios|android|edg|fxios).)*safari/i.test(navigator.userAgent);
  const webm = document.createElement('video').canPlayType('video/webm; codecs="vp9, opus"') === 'probably';
  return webm && !safari ? EXPLAINER.webm : EXPLAINER.mp4;
}

/** m:ss, for the length and the elapsed time. */
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
