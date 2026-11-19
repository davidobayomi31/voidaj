import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './App.jsx'
import './styles.css'
import './redesign.css'
import './theme.css'
import './neon.css'
import './glass.css'
import './business.css'
import './mono.css'
import './citymap.css'
import './reddit.css'
import './design.css'
import './nov12.css'
import './plan-nov12.css'

// Counts visits for the Vercel dashboard (no cookies, nobody identified). See the Privacy page.
inject()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
