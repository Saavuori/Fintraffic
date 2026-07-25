import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted rather than fetched from Google's CDN: one less third-party
// round-trip on a phone network, and the app keeps its typography offline.
import '@fontsource/barlow-semi-condensed/latin-400.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-700.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './shared/styles/tokens.css'
import './index.css'
// Last: the phone layer overrides the desktop stylesheet above it.
import './shared/styles/mobile.css'
import './shared/lib/maplibre.ts'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
