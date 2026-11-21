import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './auth/AuthContext.jsx';
import { SocketProvider } from './realtime/SocketContext.jsx';
import App from './App.jsx';
import '@fontsource-variable/manrope';
import './styles.css';
import './lib/installPrompt.js'; // listens for the browser's install prompt from the start

// Installable app: the service worker caches the app shell so it opens instantly and works offline.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // A new version took over: reload once so the page and its files match.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <App />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
