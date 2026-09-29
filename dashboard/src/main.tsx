import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from './context/ThemeModeContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  </StrictMode>,
)
