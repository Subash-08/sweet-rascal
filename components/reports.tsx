'use client';

import { useState } from 'react';
import { Download, FileText, Filter } from 'lucide-react';
import { type Bill, type Database, type Visit, methods, rupees, serviceDay, shortDate, timeZone, totals } from '../lib/demo';
import { guestLabel } from './overview';
import { DataTable, Field, SearchInput, Title } from './ui';
import { TicketCard } from './ticket-card';
import '../app/reports.css';

const inServiceDay = (at: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
function csvDownload(name: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(value => {
    const text = String(value);
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  const href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
export function Reports({ data, viewBill, openOrder }: { data: Database; viewBill: (bill: Bill) => void; openOrder: (order: Visit) => void }) {
  const today = serviceDay();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState('Sales');
  const [method, setMethod] = useState('All methods');
  const [service, setService] = useState('All service');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const weekStart = new Date(Date.parse(today + 'T12:00:00Z') - 6 * 86_400_000).toISOString().slice(0, 10);
  const valid = Boolean(from && to && from <= to);
  const inRange = (day: string) => valid && day >= from && day <= to;
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const bills = data.bills.filter(bill => !bill.voided && inRange(bill.date) &&
    (service === 'All service' || (bill.order.kind || 'Dine-in') === service) &&
    (method === 'All methods' || bill.payments.some(payment => payment.method === method) || bill.order.advance?.method === method) &&
    matches(bill.id + ' ' + guestLabel(bill.order)));
  const refunds = (data.refunds ?? []).filter(refund => {
    const bill = data.bills.find(bill => bill.id === refund.billId);
    return inRange(inServiceDay(refund.at)) && (method === 'All methods' || refund.method === method) &&
      (service === 'All service' || (bill?.order.kind || 'Dine-in') === service) &&
      matches(refund.billId + ' ' + refund.reason + ' ' + refund.actor);
  });
  const activity = data.orders.flatMap(order => (order.events ?? []).map(event => ({ ...event, orderId: order.id, kind: order.kind || 'Dine-in' })))
    .filter(event => inRange(inServiceDay(event.at)) && (service === 'All service' || event.kind === service) &&
      matches([event.orderId, event.actor, event.action, event.detail].join(' ')))
    .sort((a, b) => b.at.localeCompare(a.at));
  const sales = bills.reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate, bill.order.discount).total, 0);
  const refundAmount = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const gst = bills.reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate, bill.order.discount).tax * 2, 0);
  const count = tab === 'Sales' ? bills.length : tab === 'Refunds' ? refunds.length : activity.length;
  function download() {
    if (tab === 'Sales') csvDownload('Sweet-Rascal-Sales-' + from + '-' + to + '.csv', [
      ['Bill', 'Date', 'Guest', 'Service', 'Sales including GST (INR)', 'GST (INR)', 'Tip (INR)'],
      ...bills.map(bill => { const value = totals(bill.order.items, bill.taxRate, bill.order.discount);
        return [bill.id, bill.date, guestLabel(bill.order), bill.order.kind || 'Dine-in', value.total / 100, value.tax * 2 / 100, (bill.order.tip || 0) / 100]; }),
    ]);
    else if (tab === 'Refunds') csvDownload('Sweet-Rascal-Refunds-' + from + '-' + to + '.csv', [
      ['Reference', 'Bill', 'Time', 'Amount returned (INR)', 'Sales reduction (INR)', 'GST portion (INR)', 'Tip returned (INR)', 'Method', 'Reason', 'By', 'Cancelled'],
      ...refunds.map(refund => [refund.id, refund.billId, refund.at, refund.amount / 100, refund.salesAmount / 100, refund.taxAmount / 100, refund.tipAmount / 100, refund.method, refund.reason, refund.actor, refund.cancelled ? 'Yes' : 'No']),
    ]);
    else csvDownload('Sweet-Rascal-Activity-' + from + '-' + to + '.csv', [
      ['Order', 'Time', 'Staff', 'Action', 'Details'],
      ...activity.map(event => [event.orderId, event.at, event.actor, event.action, event.detail || '']),
    ]);
  }
  return <div className="reports">
    <Title title="Reports" subtitle="Filter and download sales, refunds and service activity." action={<button className="btn primary" disabled={!valid || !count} onClick={download}><Download size={17} aria-hidden="true" /> Download CSV</button>} />
    <section className="panel report-filters" aria-label="Report filters">
      <div className="report-filter-toolbar"><div className="chips">{['Sales', 'Refunds', 'Activity'].map(name => <button key={name} className={tab === name ? 'active' : ''} aria-pressed={tab === name} onClick={() => { setTab(name); setQuery(''); }}>{name}</button>)}</div>
        <button className="btn secondary report-filter-toggle" aria-expanded={filtersOpen} aria-controls="report-filter-fields" onClick={() => setFiltersOpen(open => !open)}><Filter size={16} aria-hidden="true" /> Filters</button></div>
      <div className="chips report-presets" aria-label="Quick date range">{[['Today', today], ['Last 7 days', weekStart], ['This month', today.slice(0, 8) + '01']].map(([label, start]) =>
        <button key={label} aria-pressed={from === start && to === today} className={from === start && to === today ? 'active' : ''} onClick={() => { setFrom(start); setTo(today); }}>{label}</button>)}</div>
      <div id="report-filter-fields" className={'report-filter-grid' + (filtersOpen ? ' is-open' : '')}>
        <Field label="Start date"><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></Field>
        <Field label="End date"><input type="date" value={to} onChange={event => setTo(event.target.value)} /></Field>
        <Field label="Service"><select value={service} onChange={event => setService(event.target.value)}><option>All service</option><option>Dine-in</option><option>Parcel</option></select></Field>
        {tab !== 'Activity' && <Field label={tab === 'Sales' ? 'Bills paid using' : 'Refund method'}><select value={method} onChange={event => setMethod(event.target.value)}><option>All methods</option>{methods.map(value => <option key={value}>{value}</option>)}</select></Field>}
      </div>
      <SearchInput value={query} onChange={setQuery} placeholder={tab === 'Activity' ? 'Search order, staff or action…' : 'Search bill, guest or reason…'} />
    </section>
    {!valid ? <p className="error" role="alert">Choose a start date on or before the end date.</p> : <>
      <section className="panel report-record-summary" aria-live="polite">
        <Filter size={18} aria-hidden="true" /><span>{count} {tab === 'Refunds' ? 'refund' : tab === 'Activity' ? 'activity' : 'sales'} records · {shortDate(from)} – {shortDate(to)}</span>
        <strong>{tab === 'Sales' ? rupees(sales, true) : tab === 'Refunds' ? rupees(refundAmount, true) + ' returned' : ''}</strong>
        {tab === 'Sales' && <small>Includes {rupees(gst, true)} GST. Refunds are listed by refund date in the Refunds tab.</small>}
      </section>
      {tab === 'Sales' ? <DataTable key={tab + from + to + method + service + query} rows={bills} empty="No sales match these filters" mobileCard={bill => <TicketCard reference={bill.id} guest={guestLabel(bill.order)} context={bill.date + ' · ' + (bill.order.kind || 'Dine-in')} status={<FileText size={17} />} amount={<b>{rupees(totals(bill.order.items, bill.taxRate, bill.order.discount).total, true)}</b>} action="View bill" onOpen={() => viewBill(bill)} />}
        columns={[
          { label: 'Bill', render: bill => <button className="text-button" onClick={() => viewBill(bill)}>{bill.id}</button> },
          { label: 'Date', render: bill => bill.date, sort: bill => bill.date },
          { label: 'Guest', render: bill => guestLabel(bill.order), sort: bill => guestLabel(bill.order) },
          { label: 'Service', render: bill => bill.order.kind || 'Dine-in' },
          { label: 'Sales incl. GST', numeric: true, render: bill => rupees(totals(bill.order.items, bill.taxRate, bill.order.discount).total, true) },
        ]} /> : tab === 'Refunds' ? <DataTable rows={refunds} empty="No refunds match these filters" mobileCard={refund => <TicketCard reference={refund.billId} guest={rupees(refund.amount, true) + ' returned'} context={refund.reason + ' · ' + refund.actor} status={<span>{refund.cancelled ? 'Cancelled' : 'Refunded'}</span>} />}
          columns={[
            { label: 'Bill', render: refund => <button className="text-button" onClick={() => { const bill = data.bills.find(bill => bill.id === refund.billId); if (bill) viewBill(bill); }}>{refund.billId}</button> },
            { label: 'Date', render: refund => inServiceDay(refund.at), sort: refund => refund.at },
            { label: 'Returned', numeric: true, render: refund => rupees(refund.amount, true) },
            { label: 'Reason', render: refund => refund.reason }, { label: 'By', render: refund => refund.actor },
            { label: 'Status', render: refund => refund.cancelled ? 'Cancelled' : 'Refunded' },
          ]} /> : <DataTable rows={activity} empty="No activity matches these filters" mobileCard={event => <TicketCard reference={event.orderId} guest={event.action} context={event.actor + ' · ' + new Date(event.at).toLocaleString('en-IN', { timeZone }) + ' · ' + (event.detail || '')} status={<span>{event.kind}</span>} />}
            columns={[
              { label: 'Order', render: event => <button className="text-button" onClick={() => { const order = data.orders.find(order => order.id === event.orderId); if (order) openOrder(order); }}>{event.orderId}</button> },
              { label: 'Time (IST)', render: event => new Date(event.at).toLocaleString('en-IN', { timeZone }), sort: event => event.at },
              { label: 'Staff', render: event => event.actor }, { label: 'Action', render: event => event.action }, { label: 'Details', render: event => event.detail || '—' },
            ]} />}
    </>}
  </div>;
}
