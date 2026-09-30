import { next, rewrite } from '@vercel/functions';
import { GATE_PATH, gateDecision, splashFile } from './server/gate.js';

/**
 * The password gate, as Vercel Routing Middleware (it runs in front of the
 * static site). An optimistic check: it compares a cookie to a constant and
 * reads nothing else. The password itself is checked in api/enter.ts, on the
 * server, so it never ships to the browser.
 */
export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const to = gateDecision(url, request.headers.get('cookie'));
  // /enter serves whichever splash screen SPLASH_SCREEN picks
  if (!to && url.pathname === GATE_PATH) return rewrite(new URL(splashFile(), url));
  if (!to) return next();
  return new Response(null, { status: 307, headers: { Location: to, 'Cache-Control': 'no-store' } });
}
