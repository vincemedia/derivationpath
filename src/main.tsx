import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito'
import './index.css'
import App from './App.tsx'
import { applyTheme, initialTheme } from './hooks/useTheme'

// Before first render, so a saved dark theme doesn't flash light.
applyTheme(initialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
