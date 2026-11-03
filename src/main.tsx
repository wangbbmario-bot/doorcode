import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { grabKeyFromUrl } from './lib/api'

// 线上带口令访问：?k=xxx -> 存进 localStorage 并从地址栏抹掉
grabKeyFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
