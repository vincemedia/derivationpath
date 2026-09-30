import { next } from '@vercel/functions';
import { gateDecision } from './server/gate.js';

/**
 * The password gate, as Vercel Routing Middleware (it runs in front of the
 * static site). An optimistic check: it compares a cookie to a constant and
 * reads nothing else. The password itself is checked in api/enter.ts, on the
 * server, so it never ships to the browser.
 */
export default function middleware(request: Request): Response {
  const to = gateDecision(new URL(request.url), request.headers.get('cookie'));
  if (!to) return next();
  return new Response(null, { status: 307, headers: { Location: to, 'Cache-Control': 'no-store' } });
}
