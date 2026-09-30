import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { checkPassword, gateDecision, GATE_PATH, openCookie, splashFile } from './server/gate'

/**
 * The password gate on the dev server too, so it can be reviewed locally. On
 * Vercel the same rules run as middleware.ts and api/enter.ts; both read
 * server/gate.ts.
 */
function gate(): Plugin {
  return {
    name: 'password-gate',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/api/enter' && req.method === 'POST') {
          let raw = '';
          req.on('data', chunk => { raw += chunk; });
          req.on('end', () => {
            let body: unknown = null;
            try { body = JSON.parse(raw); } catch { /* a wrong password */ }
            const ok = checkPassword(body);
            res.statusCode = ok ? 200 : 401;
            res.setHeader('Content-Type', 'application/json');
            if (ok) res.setHeader('Set-Cookie', openCookie(false));
            res.end(JSON.stringify(ok ? { ok: true } : { error: "That's not the password." }));
          });
          return;
        }
        const to = gateDecision(url, req.headers.cookie);
        if (to) {
          res.statusCode = 307;
          res.setHeader('Location', to);
          res.setHeader('Cache-Control', 'no-store');
          res.end();
          return;
        }
        // /enter serves whichever splash screen SPLASH_SCREEN picks, as middleware.ts does
        if (url.pathname === GATE_PATH) req.url = `${splashFile()}${url.search}`;
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gate()],
  server: {
    allowedHosts: ['deggen.ngrok.app'],
  }
})
