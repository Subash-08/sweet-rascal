'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { rupees, shortDate, type Guest } from '../lib/demo';
import type { HistoryRow } from '../lib/history';
import { downloadWorkspaceFile, workspaceRequest } from '../lib/workspace-client';
import { DataTable, Empty, SearchInput, Title } from './ui';
import { Status } from './overview';
import { TicketCard } from './ticket-card';

export function ConnectedCustomerBills({ customerId, onBill }: { customerId: string; onBill: (id: string) => void }) {
  const [result, setResult] = useState<{ items: HistoryRow[] } | { error: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      workspaceRequest('customer-bills/' + encodeURIComponent(customerId))
        .then(({ items }) => { if (active) setResult({ items }); })
        .catch(error => { if (active) setResult({ error: error instanceof Error ? error.message : 'Could not load customer bills.' }); });
    });
    return () => { active = false; };
  }, [customerId, retry]);

  if (!result) return <p className="hint" role="status">Loading previous bills…</p>;
  if ('error' in result) return <div className="panel customer-directory"><p className="error" role="alert">{result.error}</p>
    <button className="btn secondary" onClick={() => { setResult(undefined); setRetry(value => value + 1); }}><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>;
  return <DataTable rows={result.items} empty="No bills found for this customer." columns={[
    { label: 'Bill', render: row => <button className="text-button" onClick={() => onBill(row.id)}>{row.id}</button> },
    { label: 'Date', render: row => shortDate(row.date) },
    { label: 'Service', render: row => row.kind },
    { label: 'Status', render: row => <Status status={row.status ?? 'Paid'} /> },
    { label: 'Amount', numeric: true, render: row => rupees(row.total ?? 0, true) },
  ]} mobileCard={row => <TicketCard reference={row.id} guest={row.kind} context={shortDate(row.date)}
    status={<Status status={row.status ?? 'Paid'} />} amount={<strong>{rupees(row.total ?? 0, true)}</strong>}
    action="View bill" actionLabel={'View bill ' + row.id} onOpen={() => onBill(row.id)} />} />;
}

export function ConnectedCustomers({ refresh, add, select, canExport }: { refresh: number; add: () => void; select: (guest: Guest) => void; canExport: boolean }) {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState<string[]>(['']);
  const [items, setItems] = useState<Guest[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const cursor = pages.at(-1)!;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]); setNext(null);
    const timer = setTimeout(() => {
      workspaceRequest('customers?q=' + encodeURIComponent(query.trim()) + '&cursor=' + encodeURIComponent(cursor))
        .then(result => { if (active) { setItems(result.items); setNext(result.next); } })
        .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load customers.'); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query, cursor, refresh, retry]);
  async function open(guest: Guest) {
    setError('');
    try { select((await workspaceRequest('customers/' + guest.id)).customer); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not open customer.'); }
  }
  async function download(format: 'xlsx' | 'csv') {
    setExporting(true); setExportError('');
    try { await downloadWorkspaceFile('customer-export?' + new URLSearchParams({ q: query.trim(), format }), 'Sweet-Rascal-customers.' + format); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Could not export customers.'); }
    finally { setExporting(false); }
  }
  return <>
    <Title title="Customers" subtitle="Find guests by name or mobile number." action={<button className="btn primary" onClick={add}><Plus size={17} aria-hidden="true" /> Add customer</button>} />
    <section className="panel customer-directory">
      <SearchInput value={query} onChange={value => { setQuery(value); setPages(['']); }} placeholder="Search name or mobile…" />
      {canExport && <div className="title-actions">
        <button className="btn secondary" disabled={exporting} onClick={() => void download('xlsx')}>Download customers (Excel)</button>
        <button className="btn secondary" disabled={exporting} onClick={() => void download('csv')}>Download CSV</button>
        {exporting && <span role="status">Preparing download…</span>}
      </div>}
      {exportError && <p className="error" role="alert">{exportError}</p>}
      {error ? <div><p className="error" role="alert">{error}</p><button className="btn secondary" onClick={() => setRetry(count => count + 1)}><RefreshCw size={16} /> Try again</button></div> :
        loading ? <p role="status">Loading customers…</p> : items.length ? <div className="customer-directory-grid">{items.map(guest =>
          <TicketCard key={guest.id} reference={guest.phone ? '+91 ' + guest.phone : 'No phone'} guest={guest.name} status={<Status status={guest.sync} />}
            action="View customer" onOpen={() => void open(guest)} />)}</div> : <Empty title="No customers found" detail="Search another name or add a customer." />}
      <div className="table-foot"><span>Page {pages.length}</span><div className="row">
        <button className="icon-button" aria-label="Previous customers" disabled={pages.length === 1 || loading} onClick={() => setPages(value => value.slice(0, -1))}><ChevronLeft size={18} /></button>
        <button className="icon-button" aria-label="Next customers" disabled={!next || loading} onClick={() => { if (next) setPages(value => [...value, next]); }}><ChevronRight size={18} /></button>
      </div></div>
    </section>
  </>;
}
