'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Smartphone } from 'lucide-react';
import { Field } from './ui';

type Status = { configured: boolean; access?: 'owner' | 'staff' | null; connected?: boolean; account?: string };
const endpoint = '/api/google-contacts';

export async function contactRequest(action: string, data: object = {}) {
  const result = await fetch(endpoint + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload.message || 'Google Contacts could not be reached.');
  return payload;
}

export function GoogleContactsAccess({ ownerView }: { ownerView: boolean }) {
  const [status, setStatus] = useState<Status>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function refresh() {
    const result = await fetch(endpoint, { cache: 'no-store' });
    setStatus(await result.json());
  }
  useEffect(() => {
    refresh().catch(() => setStatus({ configured: false }));
    const url = new URL(location.href);
    const result = url.searchParams.get('contactConnection');
    if (!ownerView || !result) return;
    setMessage(result === 'connected' ? 'Google Contacts connected.' : result === 'wrong-account'
      ? 'Choose the restaurant Google account configured for this app.' : 'Google did not connect. Unlock owner access and try again.');
    url.searchParams.delete('contactConnection');
    history.replaceState(null, '', url);
  }, [ownerView]);
  async function act(action: 'unlock' | 'lock' | 'authorize', event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await contactRequest(action, action === 'unlock' ? { code } : {});
      setCode('');
      if (action === 'authorize') { location.assign(result.url); return; }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <section className="panel settings-panel section-spacing">
    <div className="section-head"><h2><Smartphone size={17} aria-hidden="true" /> Google Contacts</h2></div>
    {!status ? <p className="hint">Checking contact sync…</p> : !status.configured ? <p className="hint">Google Contacts is not configured on this server. Customer records still save in Sweet Rascal.</p> :
      status.access ? <>
        <p className="hint">{status.connected ? 'Google Contacts is connected.' : 'Waiting for the owner to connect Google Contacts.'} {status.account}</p>
        <div className="row">
          {ownerView && status.access === 'owner' && <button className="btn primary" disabled={busy} onClick={() => void act('authorize')}>{status.connected ? 'Reconnect Google account' : 'Connect Google account'}</button>}
          <button className="btn secondary" disabled={busy} onClick={() => void act('lock')}>Lock contact sync here</button>
        </div>
        {ownerView && status.access !== 'owner' && <p className="hint">To connect or change the account, lock this browser and unlock it with the owner code.</p>}
      </> : <form onSubmit={event => void act('unlock', event)}>
        <Field label="Contact sync access code"><input type="password" autoComplete="off" maxLength={256} required value={code} onChange={event => setCode(event.target.value)} /></Field>
        <p className="hint">{ownerView ? 'Use the owner code to connect the restaurant Google account.' : 'Ask the owner for the staff code. You don’t need the restaurant’s Google password.'}</p>
        <button className="btn primary" disabled={busy}>Unlock contact sync</button>
      </form>}
    {message && <p className="hint" role="status">{message}</p>}
  </section>;
}
