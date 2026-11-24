'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Filter, RefreshCw, Search } from 'lucide-react';
import { methods, rupees, serviceDay, shortDate, timeZone, type Role } from '../lib/demo';
import type { HistoryResource, HistoryResponse, HistoryRow, HistorySort } from '../lib/history';
import { downloadWorkspaceFile, workspaceRequest } from '../lib/workspace-client';
import { Badge, DataTable, Empty, Field, Title, type Column } from './ui';
import { TicketCard } from './ticket-card';
import '../app/history.css';

const statuses = ['all', 'Paid', 'Part refunded', 'Refunded', 'Cancelled', 'Voided'];
const sorts: { value: HistorySort; label: string }[] = [
  { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Amount: high to low' }, { value: 'amount-asc', label: 'Amount: low to high' },
  { value: 'guest', label: 'Guest: A–Z' },
];
const labels: Record<HistoryResource, string> = { bills: 'Bills', sales: 'Sales', refunds: 'Refunds', activity: 'Activity', payments: 'Payments' };
function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
function rowTime(row: HistoryRow) {
  if (row.at && Number.isFinite(Date.parse(row.at))) return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.at));
  return [validDay(row.date) ? shortDate(row.date) : row.date, row.time].filter(Boolean).join(' · ');
}

export function ConnectedHistory({ resource, role, onBill, onOrder, refresh = 0 }: {
  resource: HistoryResource; role: Role; onBill: (id: string) => void; onOrder: (id: string) => void; refresh?: number;
}) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const urlQuery = searchParams.toString();
  const [navigationPending, startTransition] = useTransition();
  const filterId = useId(), hintId = useId();
  const today = serviceDay(), staffBills = role === 'Staff' && resource === 'bills';
  const tab = searchParams.get('tab');
  const active: HistoryResource = resource === 'sales' && (tab === 'refunds' || tab === 'activity') ? tab : resource;
  const defaultFrom = staffBills ? today : active === 'activity' ? new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10) : today.slice(0, 8) + '01';
  const from = staffBills ? today : searchParams.get('from') ?? defaultFrom;
  const to = staffBills ? today : searchParams.get('to') ?? today;
  const service = searchParams.get('service') ?? 'all';
  const method = active === 'activity' ? 'all' : searchParams.get('method') ?? 'all';
  const status = active === 'bills' ? searchParams.get('status') ?? 'all' : 'all';
  const requestedSort = searchParams.get('sort') ?? 'newest';
  const sort = active === 'activity' && !['newest', 'oldest'].includes(requestedSort) ? 'newest' : requestedSort;
  const query = searchParams.get('q') ?? '';
  const pageText = searchParams.get('page') ?? '1';
  const page = /^\d+$/.test(pageText) && Number.isSafeInteger(Number(pageText)) ? Math.max(1, Number(pageText)) : 1;
  const [draft, setDraft] = useState({ base: query, value: query });
  const search = draft.base === query ? draft.value : query;
  const searchPending = search !== query;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: HistoryResponse; error?: string }>();
  const [exportState, setExportState] = useState<{ key: string; busy: boolean; error?: string }>();
  const exportVersion = useRef(0);

  const dateError = !validDay(from) || !validDay(to) || from > to ? 'Choose valid dates with the start on or before the end.'
    : (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > 366 ? 'Choose a range of 366 days or fewer.' : '';
  const filterError = query.trim().length > 80 ? 'Keep your search to 80 characters or fewer.' : !['all', 'Dine-in', 'Parcel'].includes(service) || !['all', ...methods].includes(method) || !statuses.includes(status)
    || !sorts.some(option => option.value === sort) ? 'A filter in this URL is invalid. Reset filters to continue.' : '';
  const validation = dateError || filterError;
  const params = new URLSearchParams({ resource: active, from, to, service, sort, q: query });
  const customer = searchParams.get('customer');
  if (customer) params.set('customer', customer);
  if (active !== 'activity') params.set('method', method);
  if (active === 'bills') params.set('status', status);
  const exportQuery = params.toString();
  if (active === 'activity') params.set('recent', '1');
  const after = searchParams.get('after'), before = searchParams.get('before');
  if (after) params.set('after', after);
  else if (before) params.set('before', before);
  const requestQuery = params.toString();
  const requestKey = JSON.stringify([requestQuery, refresh, retry, role]);
  const loading = !validation && (result?.key !== requestKey || !result.data && !result.error);
  const blocked = Boolean(validation || navigationPending || searchPending || loading);
  const data = !blocked && result?.key === requestKey && !result.error ? result.data : undefined;
  const error = !validation && result?.key === requestKey ? result.error : undefined;
  const exporting = exportState?.key === exportQuery && exportState.busy;
  const exportError = exportState?.key === exportQuery ? exportState.error : undefined;

  const update = useCallback((changes: Record<string, string | null>, paginate = false) => {
    const next = new URLSearchParams(urlQuery);
    if (!paginate) { next.delete('after'); next.delete('before'); next.delete('page'); }
    Object.entries(changes).forEach(([key, value]) => { if (value === null) next.delete(key); else next.set(key, value); });
    startTransition(() => router.replace(pathname + '?' + next.toString(), { scroll: false }));
  }, [urlQuery, pathname, router]);

  useEffect(() => {
    if (!searchPending) return;
    const timeout = window.setTimeout(() => update({ q: search || null }), 250);
    return () => window.clearTimeout(timeout);
  }, [search, searchPending, update]);

  useEffect(() => {
    if (validation || searchPending) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      workspaceRequest('history?' + requestQuery)
        .then((response: HistoryResponse) => { if (active) setResult({ key: requestKey, data: response }); })
        .catch((cause: unknown) => { if (active) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : 'Could not load history. Please retry.' }); });
    });
    return () => { active = false; };
  }, [requestQuery, requestKey, validation, searchPending]);

  useEffect(() => {
    setExportState(undefined);
    return () => { exportVersion.current += 1; };
  }, [exportQuery]);

  function reset() {
    setDraft({ base: query, value: '' });
    update({ from: defaultFrom, to: today, service: null, method: null, status: null, sort: null, q: null, customer: null });
  }
  async function download(format: 'csv' | 'xlsx') {
    if (!data || exporting) return;
    const version = ++exportVersion.current;
    const current = () => exportVersion.current === version;
    setExportState({ key: exportQuery, busy: true });
    try {
      await downloadWorkspaceFile('export?' + exportQuery + '&format=' + format, `Sweet-Rascal-${active}-${from}-${to}.${format}`, current);
      if (current()) setExportState({ key: exportQuery, busy: false });
    } catch (cause) {
      if (current()) setExportState({ key: exportQuery, busy: false, error: cause instanceof Error ? cause.message : 'Download failed. Please retry.' });
    }
  }

  const billId = (row: HistoryRow) => row.billId || (active === 'bills' || active === 'sales' ? row.id : undefined);
  const billLink = (row: HistoryRow) => { const id = billId(row); return id ? <button className="text-button" aria-label={'View bill ' + id} onClick={() => onBill(id)}>{id}</button> : <span>—</span>; };
  const orderLink = (row: HistoryRow) => row.orderId ? <button className="text-button" aria-label={'Open order ' + row.orderId} onClick={() => onOrder(row.orderId!)}>{row.orderId}</button> : <span>—</span>;
  const money = (value?: number) => rupees(value ?? 0, true);
  const dateColumn: Column<HistoryRow> = { label: 'Date & time (IST)', render: rowTime };
  const amountColumn: Column<HistoryRow> = { label: 'Amount', numeric: true, render: row => money(row.amount) };
  const serviceColumn: Column<HistoryRow> = { label: 'Service', render: row => row.kind };
  const columns: Column<HistoryRow>[] = active === 'activity' ? [
    { label: 'Order', render: orderLink }, dateColumn, serviceColumn, { label: 'Staff', render: row => row.actor || '—' },
    { label: 'Action', render: row => row.action || '—' }, { label: 'Details', render: row => row.detail || '—' },
  ] : active === 'refunds' ? [
    { label: 'Bill', render: billLink }, dateColumn, amountColumn, { label: 'Method', render: row => row.method || '—' },
    { label: 'Reason', render: row => row.reason || '—' }, { label: 'By', render: row => row.actor || '—' },
  ] : active === 'payments' ? [
    dateColumn, { label: 'Guest', render: row => row.guest || 'Guest' }, amountColumn,
    { label: 'Method', render: row => row.method || '—' }, { label: 'Type', render: row => row.paymentType || '—' },
    { label: 'Bill', render: billLink }, { label: 'Order', render: orderLink },
  ] : [
    { label: 'Bill', render: billLink }, dateColumn, { label: 'Guest', render: row => row.guest || 'Guest' }, serviceColumn,
    { label: 'Sales incl. GST', numeric: true, render: row => money(row.sales ?? row.total) },
    { label: 'GST', numeric: true, render: row => money(row.gst) }, { label: 'Tip', numeric: true, render: row => money(row.tip) },
    ...(active === 'bills' ? [{ label: 'Bill total', numeric: true, render: (row: HistoryRow) => money(row.total) }] : []),
    { label: 'Status', render: row => <Badge tone={row.status === 'Paid' ? 'green' : row.status === 'Part refunded' ? 'amber' : 'gray'}>{row.status || '—'}</Badge> },
  ];
  function mobileCard(row: HistoryRow) {
    const bill = billId(row), order = row.orderId;
    const primaryId = bill || order;
    return <TicketCard reference={primaryId || row.id} guest={active === 'activity' ? row.action || 'Service activity' : row.guest || 'Guest'}
      context={[rowTime(row), row.kind, row.method, row.paymentType, row.reason, row.actor, row.detail].filter(Boolean).join(' · ')}
      status={row.status ? <Badge>{row.status}</Badge> : <span>{labels[active]}</span>}
      amount={active === 'activity' ? undefined : <div><strong>{money(active === 'bills' ? row.total : active === 'sales' ? row.sales ?? row.total : row.amount)}</strong>{(active === 'bills' || active === 'sales') && <small>GST {money(row.gst)} · Tip {money(row.tip)}</small>}</div>}
      action={bill ? 'View Bill' : 'Open Order'} actionLabel={(bill ? 'View bill ' : 'Open order ') + primaryId}
      onOpen={bill ? () => onBill(bill) : order ? () => onOrder(order) : undefined}
      />;
  }
  const title = resource === 'sales' ? 'Reports' : labels[resource];
  return <div className="connected-history">
    <Title title={title} subtitle={resource === 'sales' ? 'Filter and download sales, refunds and service activity.' : resource === 'bills' ? 'Find, reprint and share issued bills.' : resource === 'payments' ? 'Review recorded payments and advances.' : 'Follow your team’s service activity.'}
      action={<><button type="button" className="btn primary" disabled={!data?.items.length || exporting} onClick={() => void download('xlsx')}><Download size={17} aria-hidden="true" />Download Excel</button><button type="button" className="btn secondary" disabled={!data?.items.length || exporting} onClick={() => void download('csv')}>Download CSV</button></>} />
    <section className="panel ch-filters" aria-label="History filters">
      {resource === 'sales' && <div className="chips ch-tabs" aria-label="Report views">{(['sales', 'refunds', 'activity'] as const).map(value => <button type="button" key={value} className={active === value ? 'active' : ''} aria-pressed={active === value}
        onClick={() => update({ tab: value, ...(value === 'activity' ? { method: null, status: null, sort: ['newest', 'oldest'].includes(sort) ? sort : 'newest' } : { status: null }) })}>{labels[value]}</button>)}</div>}
      <div className="ch-range-bar"><span><CalendarDays size={17} aria-hidden="true" />{validDay(from) && validDay(to) ? `${shortDate(from)} – ${shortDate(to)} · ${from.slice(0, 4)}${from.slice(0, 4) !== to.slice(0, 4) ? '–' + to.slice(0, 4) : ''}` : 'Choose a valid date range'}</span>
        <button type="button" className="btn secondary ch-filter-toggle" aria-expanded={filtersOpen} aria-controls={filterId} onClick={() => setFiltersOpen(value => !value)}><Filter size={16} aria-hidden="true" />{filtersOpen ? 'Hide Filters' : 'Filters'}</button></div>
      <label className="search ch-search"><Search size={18} aria-hidden="true" /><input type="search" name="history-search" autoComplete="off" spellCheck={false} maxLength={80} aria-label="Search history" placeholder={active === 'activity' ? 'Search order, staff or action…' : 'Search bill, guest or reference…'} value={search} onChange={event => setDraft({ base: query, value: event.target.value })} /></label>
      <div id={filterId} className={'ch-filter-fields' + (filtersOpen ? ' is-open' : '')}>
        <Field label="From"><input type="date" name="from" value={from} disabled={staffBills} aria-describedby={hintId} aria-invalid={Boolean(dateError)} onChange={event => update({ from: event.target.value })} /></Field>
        <Field label="To"><input type="date" name="to" value={to} disabled={staffBills} aria-describedby={hintId} aria-invalid={Boolean(dateError)} onChange={event => update({ to: event.target.value })} /></Field>
        <Field label="Service"><select name="service" value={service} onChange={event => update({ service: event.target.value })}><option value="all">All services</option><option>Dine-in</option><option>Parcel</option></select></Field>
        {active !== 'activity' && <Field label={active === 'bills' || active === 'sales' ? 'Bills paid using' : active === 'refunds' ? 'Refund method' : 'Payment method'}><select name="method" value={method} onChange={event => update({ method: event.target.value })}><option value="all">All methods</option>{methods.map(value => <option key={value}>{value}</option>)}</select></Field>}
        {active === 'bills' && <Field label="Bill status"><select name="status" value={status} onChange={event => update({ status: event.target.value })}>{statuses.map(value => <option key={value} value={value}>{value === 'all' ? 'All statuses' : value}</option>)}</select></Field>}
        <div className="ch-reset"><button type="button" className="text-button" onClick={reset}>Reset Filters</button></div>
      </div>
      <p className="ch-hint" id={hintId}>{staffBills ? 'Staff can view today’s bills only. Dates follow restaurant time (IST).' : 'Choose up to 366 days per range. Dates follow restaurant time (IST).'}</p>
      {customer && <p className="ch-hint">Showing bills for the selected customer. Reset Filters to see all customers.</p>}
      {active === 'refunds' && <p className="ch-hint">Open a bill and use Refund / cancel bill to record a partial or full refund after returning the money. The original bill stays available.</p>}
      {active === 'activity' && <p className="ch-hint">Activity loads 10 records at a time. Change the dates to look further back.</p>}
      {validation && <p className="error" role="alert">{validation}</p>}
    </section>
    <div className="ch-results-toolbar"><h2><FileText size={18} aria-hidden="true" />{labels[active]} History</h2><label className="ch-sort"><ArrowDownUp size={16} aria-hidden="true" /><span className="ch-sr-only">Sort all matching records</span><select name="sort" value={sort} onChange={event => update({ sort: event.target.value })}>{sorts.filter(option => active !== 'activity' || ['newest', 'oldest'].includes(option.value)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
    <div aria-live="polite" className="ch-feedback">{exporting && <p role="status">Preparing your filtered download…</p>}{exportError && <p className="error" role="alert">{exportError}</p>}</div>
    {data && active !== 'activity' && <section className="panel ch-summary" aria-label="All filtered records summary">
      <div><span>All matching records</span><strong>{new Intl.NumberFormat('en-IN').format(data.total)}</strong></div>
      {(active === 'sales' || active === 'bills') && <><div><span>Sales incl. GST</span><strong>{money(data.summary.sales)}</strong></div><div><span>GST included</span><strong>{money(data.summary.gst)}</strong></div><div><span>Tips, separate</span><strong>{money(data.summary.tips)}</strong></div></>}
      {active === 'refunds' && <><div><span>Total returned</span><strong>{money(data.summary.amount)}</strong></div><div><span>Sales returned</span><strong>{money(data.summary.salesAmount)}</strong></div><div><span>GST portion</span><strong>{money(data.summary.taxAmount)}</strong></div><div><span>Tips returned</span><strong>{money(data.summary.tipAmount)}</strong></div></>}
      {active === 'payments' && <div><span>Recorded payments</span><strong>{money(data.summary.amount)}</strong></div>}
      <p>Totals cover every matching record across all pages.{(active === 'bills' || active === 'sales') && ' Sales include GST. Sales totals exclude voided bills and tips; refunds are listed separately.'}{method !== 'all' && (active === 'bills' || active === 'sales') && ' The method filter includes each matching bill’s full sales amount.'}{(active === 'sales' || active === 'refunds') && ' Refunds are listed by refund date.'}{active === 'payments' && ' Includes advances. Refunds are listed separately.'}</p>
    </section>}
    <section className="ch-results" aria-label={labels[active] + ' records'} aria-busy={blocked && !validation}>
      {validation ? <div className="panel"><Empty title="Check your filters" detail="Correct the filters above to load history." /></div> : blocked ? <div className="panel ch-state" role="status"><RefreshCw size={22} aria-hidden="true" /><strong>Loading {labels[active].toLowerCase()}…</strong><span>Fetching matching records and totals.</span></div> : error ? <div className="panel ch-state" role="alert"><strong>Could not load history</strong><p>{error}</p><button type="button" className="btn secondary" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Retry History</button></div> : data ? <DataTable key={requestKey} rows={data.items} columns={columns} pageSize={20} mobileCard={mobileCard} empty={'No ' + labels[active].toLowerCase() + ' match these filters'} /> : null}
    </section>
    <nav className="ch-pagination" aria-label="History pages"><span>{data && active !== 'activity' ? `Page ${page} · ${data.items.length} shown of ${data.total} records` : `Page ${page}`}</span><div><button type="button" className="btn secondary" disabled={!data?.previous || blocked} onClick={() => data?.previous && update({ after: null, before: data.previous, page: String(Math.max(1, page - 1)) }, true)}><ChevronLeft size={17} aria-hidden="true" />Previous</button><button type="button" className="btn secondary" disabled={!data?.next || blocked} onClick={() => data?.next && update({ before: null, after: data.next, page: String(page + 1) }, true)}>{active === 'activity' && sort === 'newest' ? 'Load older' : 'Next'}<ChevronRight size={17} aria-hidden="true" /></button></div></nav>
  </div>;
}
