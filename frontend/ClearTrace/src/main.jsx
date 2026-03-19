import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClearTraceProvider } from './context/ClearTraceContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClearTraceProvider>
      <App />
    </ClearTraceProvider>
  </StrictMode>,
)
