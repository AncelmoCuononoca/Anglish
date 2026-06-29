import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installAudioUnlock } from './lib/audioUnlock'

// Unlock audio playback on the first tap (needed for sound on iOS Safari).
installAudioUnlock()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
