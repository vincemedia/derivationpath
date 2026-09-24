import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito'
import './index.css'
import App from './App.tsx'
import { applyTheme, initialTheme } from './hooks/useTheme'

// Agentation annotation toolbar, dev only: the dynamic import keeps it out of
// the production bundle. Syncs annotations to the agentation-mcp server.
const Agentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then(m => ({ default: m.Agentation })))
  : null

// Before first render, so a saved dark theme doesn't flash light.
applyTheme(initialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {Agentation && (
      <Suspense fallback={null}>
        <Agentation endpoint="http://localhost:4747" className="agentation-dev" />
      </Suspense>
    )}
  </StrictMode>,
)
