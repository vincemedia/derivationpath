import { checkPassword, GATE_COOKIE, openCookie } from '../server/gate.js';

/**
 * POST /api/enter: check the shared password and open the door. On the server,
 * because a password compared in the browser is a password shipped in the
 * bundle. Only the verdict crosses.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try { body = await request.json(); } catch { /* treated as a wrong password */ }
  if (!checkPassword(body)) return Response.json({ error: "That's not the password." }, { status: 401 });
  const secure = new URL(request.url).protocol === 'https:';
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': openCookie(secure) } });
}

/** DELETE /api/enter: lock the door again. */
export async function DELETE(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': `${GATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly` } });
}
