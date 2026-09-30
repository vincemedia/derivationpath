/**
 * The password on the front door, shared by the Vercel middleware
 * (middleware.ts), the function that checks it (api/enter.ts) and the dev
 * server (vite.config.ts), so all three agree on what is locked.
 *
 * The site is deployed publicly so it can be shared with a link, and a public
 * URL is indexable and forwardable. One shared password stops a search engine
 * and a stranger; it is not authentication, and there are no accounts behind
 * it. `SITE_PASSWORD` overrides the default where it shouldn't live in git.
 */
export const GATE_PASSWORD = process.env.SITE_PASSWORD ?? 'thesoonisreal';

export const GATE_COOKIE = 'dp_gate';

/**
 * What the cookie holds: not the password (a screenshot or a support log would
 * leak it), just an opaque constant. It proves only that somebody once typed
 * the word.
 */
export const GATE_VALUE = 'open';

/** Where a locked request is sent. */
export const GATE_PATH = '/enter';

/**
 * Which splash screen the gate shows. The mystery one (the default) names
 * nothing: "?" for the app, its path and its share image. `SPLASH_SCREEN=named`
 * switches to the one with the name, the line about the app and its share
 * card. Read per request, so a redeploy after changing the env var is enough.
 */
export type Splash = 'mystery' | 'named';
export function splash(): Splash {
  return process.env.SPLASH_SCREEN === 'named' ? 'named' : 'mystery';
}
/** The file behind /enter for that screen. */
export const splashFile = (which: Splash = splash()) => `${GATE_PATH}/${which}.html`;

/**
 * What a locked-out visitor may still fetch: the chosen splash screen and its
 * font, the route that checks the password, and what a link preview needs.
 * The other screen stays locked, so the mystery version can't be seen past by
 * guessing the named one's address. Everything else, including the app's
 * scripts and the video, stays behind the gate.
 */
export function isOpenPath(pathname: string, which: Splash = splash()): boolean {
  return (
    pathname === GATE_PATH ||
    pathname === splashFile(which) ||
    pathname === `${GATE_PATH}/nunito.woff2` ||
    pathname === '/api/enter' ||
    pathname === '/favicon.svg' ||
    pathname === '/robots.txt' ||
    (which === 'mystery' ? pathname === `${GATE_PATH}/og-mystery.jpg` : pathname === '/og.png')
  );
}

/** Whether a Cookie header carries the open gate. */
export function isOpen(cookieHeader: string | null | undefined): boolean {
  return (cookieHeader ?? '').split(';').some(c => c.trim() === `${GATE_COOKIE}=${GATE_VALUE}`);
}

/**
 * Where to go after unlocking: only a path on this origin. `?next=` comes from
 * the address bar, so anything else would be an open redirect (and
 * `//elsewhere.example` is the protocol-relative case people forget).
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

/** The redirect a locked request gets, carrying where it wanted to go. */
export function gateLocation(url: URL): string {
  const gate = new URL(GATE_PATH, url);
  const wanted = `${url.pathname}${url.search}`;
  if (wanted !== '/') gate.searchParams.set('next', wanted);
  return `${gate.pathname}${gate.search}`;
}

/**
 * Where a request should be redirected, or null to let it through. Locked
 * requests go to the gate (`redirect`, not `rewrite`: a rewrite would show the
 * password box at whatever URL was asked for, and a reload after unlocking
 * would land nowhere). Somebody already through who opens the gate goes back
 * in: nobody should sit typing at an open door.
 */
export function gateDecision(url: URL, cookieHeader: string | null | undefined): string | null {
  const open = isOpen(cookieHeader);
  if (open && (url.pathname === GATE_PATH || url.pathname === splashFile())) return safeNext(url.searchParams.get('next'));
  if (open || isOpenPath(url.pathname)) return null;
  return gateLocation(url);
}

/** The Set-Cookie header that opens the gate for a month. */
export function openCookie(secure: boolean): string {
  return `${GATE_COOKIE}=${GATE_VALUE}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax; HttpOnly${secure ? '; Secure' : ''}`;
}

/**
 * Checks a submitted password. Trimmed, since a pasted password often brings
 * a trailing space. One answer for empty and for wrong: the difference only
 * helps whoever is guessing.
 */
export function checkPassword(body: unknown): boolean {
  const given = typeof body === 'object' && body && 'password' in body ? String((body as { password: unknown }).password ?? '') : '';
  return given.trim() === GATE_PASSWORD;
}
