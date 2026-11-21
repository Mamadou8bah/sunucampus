import { useEffect, useState } from 'react';

// The browser fires beforeinstallprompt once, often before React mounts, so catch it early.
let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

/**
 * How the app can be installed here:
 * 'prompt' (Chrome/Edge/Android: call install()), 'ios' (show Share → Add to Home Screen steps),
 * or null (already installed, or the browser can't install it).
 */
export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const mode = isStandalone() ? null : deferred ? 'prompt' : isIOS() ? 'ios' : null;
  async function install() {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    listeners.forEach((fn) => fn());
    return outcome === 'accepted';
  }
  return { mode, install };
}
