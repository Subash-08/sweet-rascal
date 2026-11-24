'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { workspaceRequest, type SignedInUser } from '../lib/workspace-client';
import { DataTable, Dialog, Field, Title } from './ui';

type TeamMember = SignedInUser & { active: boolean };
export function ConnectedTeam({ currentId }: { currentId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<TeamMember>();
  async function load() { setMembers((await workspaceRequest('users')).users); }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  return <>
    <Title title="Staff & access" subtitle="Owners manage settings and reports. Staff take orders and manage guests." action={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={17} /> Add staff</button>} />
    {error && <p className="error" role="alert">{error}</p>}
    <DataTable rows={members} columns={[
      { label: 'Name', render: member => member.name }, { label: 'Email', render: member => member.email },
      { label: 'Role', render: member => member.role }, { label: 'Access', render: member => member.active ? 'Active' : 'Disabled' },
      { label: 'Action', render: member => member.id === currentId ? 'Your account' : <button className="btn secondary compact" disabled={busy} onClick={() => setChanging(member)}>{member.active ? 'Disable access' : 'Enable access'}</button> },
    ]} />
    {changing && <Dialog title={changing.active ? 'Disable staff access?' : 'Enable staff access?'} close={() => { if (!busy) setChanging(undefined); }}>
      <p>{changing.name}{changing.active ? ' will be signed out and lose access.' : ' will be able to sign in again.'}</p>
      <div className="dialog-actions"><button className="btn secondary" disabled={busy} onClick={() => setChanging(undefined)}>Go back</button><button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await workspaceRequest('users', { method: 'POST', body: JSON.stringify({ id: changing.id, active: !changing.active }) }); setChanging(undefined); await load(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not update access.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Saving…' : changing.active ? 'Disable access' : 'Enable access'}</button></div>
    </Dialog>}
    {adding && <Dialog title="Add staff account" close={() => { if (!busy) setAdding(false); }}>
      <form onSubmit={async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true); setError('');
        try { await workspaceRequest('users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) }); setAdding(false); await load(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not create account.'); }
        finally { setBusy(false); }
      }}>
        <div className="form-grid"><Field label="Name"><input name="name" autoComplete="name" required maxLength={120} /></Field>
          <Field label="Email"><input name="email" type="email" autoComplete="off" spellCheck={false} required maxLength={254} /></Field>
          <Field label="Password"><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></Field></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create staff account'}</button></div>
      </form>
    </Dialog>}
  </>;
}
