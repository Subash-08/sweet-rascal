'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import { Brand, Field } from './ui';
import Restaurant from './restaurant';
import { WorkspaceLoader } from './workspace-loader';
import { workspaceRequest, type ConnectedWorkspace, type SignedInUser } from '../lib/workspace-client';

export default function WorkspaceGate({ children }: { children?: ReactNode }) {
  const [mode, setMode] = useState<'loading' | 'demo' | 'login' | 'connected' | 'error'>('loading');
  const [workspace, setWorkspace] = useState<ConnectedWorkspace>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setMode('loading'); setMessage('');
    try {
      const result = await workspaceRequest('session') as { configured: boolean; user: SignedInUser | null };
      if (!result.configured) { setMode('demo'); return; }
      if (!result.user) { setMode('login'); return; }
      const [{ business }, operations] = await Promise.all([workspaceRequest('business'), workspaceRequest('operations')]);
      setWorkspace({ user: result.user, business, operations });
      setMode('connected');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load the workspace.'); setMode('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage('');
    try {
      await workspaceRequest('login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <>
    <WorkspaceLoader visible={mode === 'loading'} />
    {mode === 'demo' ? <Restaurant>{children}</Restaurant> : mode === 'connected' && workspace ? <Restaurant connected={workspace} onSignOut={async () => {
      await workspaceRequest('logout', { method: 'POST', body: '{}' });
      setWorkspace(undefined); setMode('login');
    }}>{children}</Restaurant> : mode !== 'loading' && <main className="workspace-login"><section className="panel">
    <Brand />
    {mode === 'error' ? <>
      <h1>Couldn’t open Sweet Rascal</h1><p className="error" role="alert">{message}</p>
      <button className="btn primary" onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" /> Try again</button>
    </> : <>
      <h1>Welcome back</h1><p>Sign in to Sweet Rascal.</p>
      <form onSubmit={login}>
        <Field label="Email"><input name="email" type="email" autoComplete="username" spellCheck={false} required maxLength={254} /></Field>
        <Field label="Password"><input name="password" type="password" autoComplete="current-password" required maxLength={256} /></Field>
        {message && <p className="error" role="alert">{message}</p>}
        <button className="btn primary" disabled={busy}><LogIn size={17} aria-hidden="true" /> {busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </>}
    </section></main>}
  </>;
}
