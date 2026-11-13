'use client';

import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { Dialog } from './ui';

type InstallPrompt = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [apple, setApple] = useState(false);

  useEffect(() => {
    const display = matchMedia('(display-mode: standalone)');
    const syncDisplay = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const completed = () => { setInstalled(true); setPrompt(undefined); };
    syncDisplay();
    setApple(/iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    display.addEventListener('change', syncDisplay);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', completed);
    return () => {
      display.removeEventListener('change', syncDisplay);
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', completed);
    };
  }, []);

  if (installed) return null;
  return <>
    <button className="help-link" onClick={async () => {
      if (!prompt) { setInstructions(true); return; }
      setPrompt(undefined);
      try {
        await prompt.prompt();
        if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
      } catch { setInstructions(true); }
    }}><Download size={17} aria-hidden="true" /> Install app</button>
    {instructions && <Dialog title="Install Sweet Rascal" close={() => setInstructions(false)}>
      <p>{apple ? <>Open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</> : <>Open your browser menu and look for <b>Install app</b> or <b>Add to Home screen</b>. If the option is unavailable, open this page in a browser that supports installation.</>}</p>
      <div className="dialog-actions"><button className="btn primary" onClick={() => setInstructions(false)}>Done</button></div>
    </Dialog>}
  </>;
}

export function ConnectionGuard() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Sweet Rascal offline fallback could not be registered.', error));
    }
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  if (!offline) return null;
  return <dialog className="dialog connection-dialog" aria-labelledby="connection-title"
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => event.preventDefault()}>
    <div className="dialog-body"><WifiOff size={24} aria-hidden="true" /><h2 id="connection-title">Connection lost</h2>
      <p>Orders, billing, and other changes are paused. Keep this screen open and reconnect to continue where you left off.</p>
      <span className="badge amber" role="status">Waiting for a connection</span>
    </div>
  </dialog>;
}
