'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, IndianRupee, LayoutGrid, Plus, ReceiptText, Users, Utensils, Wallet } from 'lucide-react';
import { type Bill, type Database, type Role, type Visit, methods, payable, rupees, serviceDay, sessions, shortDate, sumPayments, timeZone, totals } from '../lib/demo';
import { Badge, DataTable, Empty, Field, Title } from './ui';

export function Status({ status }: { status: string }) {
  return <Badge tone={['Paid', 'Available', 'Synced', 'Active'].includes(status) ? 'green' : ['Open', 'Occupied', 'Sync pending', 'Sold out'].includes(status) ? 'amber' : ['Upcoming', 'Reserved'].includes(status) ? 'blue' : ['Cancelled', 'Voided'].includes(status) ? 'red' : 'gray'}>{status}</Badge>;
}
export const guestLabel = (order: Visit) => order.guest || 'Walk-in guest';
export const tableName = (data: Database, id: string) => data.tables.find(table => table.id === id)?.name ?? 'Unassigned';

function daysBefore(day: string, count: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}

function SalesChart({ bills, openReports }: { bills: Bill[]; openReports: () => void }) {
  const today = serviceDay();
  const days = Array.from({ length: 7 }, (_, index) => daysBefore(today, 6 - index));
  const amounts = days.map(day => bills.reduce((sum, bill) => !bill.voided && bill.date === day ? sum + totals(bill.order.items, bill.taxRate).total : sum, 0));
  const max = Math.max(...amounts, 1);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);

  return <section className="panel sales-panel">
    <div className="section-head"><div><h2>Sales overview</h2><p>Last 7 days</p></div><button className="text-button" onClick={openReports}>Reports <ArrowRight size={15} /></button></div>
    <strong className="sales-amount">{rupees(total)}</strong>
    <ul className="sales-chart" aria-label="Daily sales for the last 7 days">
      {days.map((day, index) => <li key={day} title={shortDate(day) + ' · ' + rupees(amounts[index])}>
        <div className="sales-track"><span className={day === today ? 'current' : ''} style={{ height: (amounts[index] / max * 100) + '%' }} /></div>
        <span>{shortDate(day)}<span className="sr-only">: {rupees(amounts[index])}</span></span>
      </li>)}
    </ul>
  </section>;
}

export function BillList({ bills, view, compact = false }: { bills: Bill[]; view: (bill: Bill) => void; compact?: boolean }) {
  const [status, setStatus] = useState('All statuses');
  const visible = bills.filter(bill => status === 'All statuses' || (status === 'Voided') === Boolean(bill.voided));
  return <DataTable rows={visible} pageSize={compact ? 4 : 8} search={compact ? undefined : bill => bill.id + ' ' + guestLabel(bill.order)}
    placeholder="Search bill or guest…" filters={compact ? undefined : <select aria-label="Bill status" value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option><option>Paid</option><option>Voided</option></select>}
    columns={[
      { label: 'Bill no.', render: bill => <button className="text-button" onClick={() => view(bill)}>{bill.id}</button>, sort: bill => Number(bill.id.split('-')[1]) },
      { label: 'Guest', render: bill => <strong>{guestLabel(bill.order)}</strong>, sort: bill => guestLabel(bill.order) },
      { label: 'Date', render: bill => <span>{shortDate(bill.date)} <small>{bill.time}</small></span>, sort: bill => bill.date + bill.time },
      { label: 'Status', render: bill => <Status status={bill.voided ? 'Voided' : 'Paid'} /> },
      { label: 'Total charged', numeric: true, render: bill => <b>{rupees(payable(bill.order, bill.taxRate))}</b>, sort: bill => payable(bill.order, bill.taxRate) },
    ]} empty="No bills in this view" />;
}
function OrderRows({ orders, data, open }: { orders: Visit[]; data: Database; open: (order: Visit) => void }) {
  return orders.length ? <div className="order-rows">{orders.map(order => <button className="order-row" key={order.id} onClick={() => open(order)}>
    <span className="row-icon">{order.status === 'Upcoming' ? <Clock3 size={19} /> : <Utensils size={18} />}</span>
    <span className="order-row-main"><strong>{guestLabel(order)}</strong><small>{order.status === 'Upcoming' ? shortDate(order.date) + ' · ' + order.time : tableName(data, order.table)} · {order.covers} covers</small></span>
    <Status status={order.status} /><ArrowRight size={16} />
  </button>)}</div> : <Empty title="No orders here" detail="New orders will appear here." />;
}

export function Dashboard({ data, role, open, newOrder, viewBill, go }: { data: Database; role: Role; open: (order: Visit) => void; newOrder: () => void; viewBill: (bill: Bill) => void; go: (page: 'Dining tables' | 'Orders' | 'Bills' | 'Reports') => void }) {
  const today = serviceDay();
  const active = data.orders.filter(order => order.status === 'Open' && !order.guestLeftAt);
  const upcoming = data.orders.filter(order => order.status === 'Upcoming').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const billsToday = data.bills.filter(bill => bill.date === today && !bill.voided);
  const sales = billsToday.reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate).total, 0);
  const covers = [...billsToday.map(bill => bill.order), ...active.filter(order => order.date === today)].reduce((sum, order) => sum + order.covers, 0);
  const cards = [
    role === 'Staff' ? { label: 'Open orders', value: active.length, icon: Utensils, detail: 'Ready to resume' } : { label: 'Sales today', value: rupees(sales), icon: IndianRupee, detail: 'Total from issued bills' },
    { label: role === 'Staff' ? 'Bills today' : 'Bills issued', value: billsToday.length, icon: ReceiptText, detail: 'Paid bills today' },
    { label: 'Dining covers', value: covers, icon: Users, detail: role === 'Staff' ? 'During today’s service' : 'Seated and served today' },
    role === 'Staff' ? { label: 'Upcoming orders', value: upcoming.length, icon: Clock3, detail: 'Phone pre-orders' } : { label: 'Average bill', value: rupees(billsToday.length ? Math.round(sales / billsToday.length) : 0), icon: Wallet, detail: 'Across today’s paid bills' },
  ];
  return <>
    <div className="overview-top service-hero">
      <div className="hero-copy"><span className="date-label"><CalendarDays size={15} /> {new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone }).format(new Date())}</span><h1>Restaurant overview</h1><p>{role === 'Staff' ? 'Orders, guests and bills for today.' : 'Today’s orders, tables and sales at Sweet Rascal.'}</p></div>
      <div className="hero-actions"><button className="btn hero-tables" onClick={() => go('Dining tables')}><LayoutGrid size={16} /> Dining tables <ArrowUpRight size={15} /></button><button className="btn primary" onClick={newOrder}><Plus size={19} /> New order</button></div>
    </div>
    <div className="metrics service-metrics">{cards.map(({ label, value, icon: Icon, detail }) => <section className="panel metric" key={label}><div className="metric-top"><span className="metric-icon"><Icon size={19} /></span><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></section>)}</div>
    <div className={'dashboard-grid service-grid' + (role === 'Staff' ? ' cashier-grid' : '')}>
      {role !== 'Staff' && <SalesChart bills={data.bills} openReports={() => go('Reports')} />}
      <section className="panel dashboard-section"><div className="section-head"><div><h2>Open orders</h2><p>{active.length} in service</p></div><button className="text-button" onClick={() => go('Orders')}>All orders <ArrowRight size={15} /></button></div><OrderRows orders={active.slice(0, 4)} data={data} open={open} /></section>
      <section className="panel dashboard-section"><div className="section-head"><div><h2>Upcoming</h2><p>Phone pre-orders and arrivals</p></div><span className="count">{upcoming.length} scheduled</span></div><OrderRows orders={upcoming.slice(0, 4)} data={data} open={open} /></section>
    </div>
    <div className="section-head section-spacing"><div><h2>Recent bills</h2><p>{role === 'Staff' ? 'Latest service bills' : 'Latest bills across the restaurant'}</p></div><button className="text-button" onClick={() => go('Bills')}>View all bills <ArrowRight size={15} /></button></div>
    <BillList bills={data.bills.slice(0, 4)} view={viewBill} compact />
  </>;
}

function Breakdown({ title, entries, count = false }: { title: string; entries: [string, number][]; count?: boolean }) {
  const max = Math.max(1, ...entries.map(([, amount]) => amount));
  return <section className="panel breakdown"><div className="section-head"><h2>{title}</h2></div>{entries.every(([, amount]) => !amount) ? <Empty title="No activity for this period" /> : entries.map(([name, amount]) => <div className="bar-row" key={name}><div><span>{name}</span><strong>{count ? amount + ' sold' : rupees(amount)}</strong></div><div className="bar-track"><span style={{ width: (amount / max * 100) + '%' }} /></div></div>)}</section>;
}
export function Reports({ data }: { data: Database }) {
  const today = serviceDay();
  const [range, setRange] = useState('Today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const invalid = !from || !to || from > to;
  const inRange = (date: string) => !invalid && date >= from && date <= to;
  const bills = data.bills.filter(bill => !bill.voided && inRange(bill.date));
  const sales = bills.reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate).total, 0);
  const orders = data.orders.filter(order => order.status !== 'Cancelled' && inRange(order.date));
  const voidOrders = new Set(data.bills.filter(bill => bill.voided).map(bill => bill.order.id));
  const collections = data.bills.filter(bill => !bill.voided).flatMap(bill => bill.payments).concat(
    data.orders.filter(order => order.status !== 'Cancelled' && !voidOrders.has(order.id)).flatMap(order => [
      ...(order.advance ? [order.advance] : []), ...(order.status !== 'Billed' ? order.payments ?? [] : []),
    ]),
  ).filter(payment => inRange(payment.date));
  const departed = orders.filter(order => order.guestLeftAt && order.status !== 'Billed');
  const due = (order: Visit) => Math.max(0, payable(order, data.business.taxRate) - (order.advance?.amount ?? 0) - sumPayments(order.payments ?? []));
  const voided = data.bills.filter(bill => bill.voided && inRange(bill.date));
  const itemCounts = new Map<string, number>();
  for (const bill of bills) for (const line of bill.order.items) itemCounts.set(line.name, (itemCounts.get(line.name) ?? 0) + line.quantity);
  const presets: Record<string, string> = { Today: today, 'Last 7 days': daysBefore(today, 6), 'This month': today.slice(0, 8) + '01' };
  return <><Title title="Reports" subtitle="Track restaurant sales and collections by date." />
    <div className="panel report-tools"><div className="chips">{[...Object.keys(presets), 'Custom'].map(name => <button aria-pressed={range === name} className={range === name ? 'active' : ''} key={name} onClick={() => { setRange(name); if (presets[name]) { setFrom(presets[name]); setTo(today); } }}>{name}</button>)}</div><div className="report-dates"><Field label="Start date"><input type="date" value={from} onChange={e => { setRange('Custom'); setFrom(e.target.value); }} /></Field><Field label="End date"><input type="date" value={to} onChange={e => { setRange('Custom'); setTo(e.target.value); }} /></Field></div></div>
    {invalid ? <p className="error" role="alert">Choose a valid start and end date.</p> : <>
      <div className="metrics">{[['Total sales', rupees(sales)], ['Bills issued', bills.length], ['Orders', orders.length], ['Average bill', rupees(bills.length ? Math.round(sales / bills.length) : 0)]].map(([label, value]) => <section className="panel metric" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
      <section className="panel breakdown day-summary"><h2>Day-end summary</h2><dl>
        <div><dt>Payments collected</dt><dd>{rupees(sumPayments(collections))}</dd></div>
        <div><dt>Tips on issued bills</dt><dd>{rupees(bills.reduce((sum, bill) => sum + (bill.order.tip ?? 0), 0))}</dd></div>
        <div><dt>Departed with a balance</dt><dd>{departed.filter(order => due(order) > 0).length} · {rupees(departed.reduce((sum, order) => sum + due(order), 0))}</dd></div>
        <div><dt>Voided bills</dt><dd>{voided.length}</dd></div>
      </dl></section>
      <div className="dashboard-grid">
        <Breakdown title="Sales by meal session" entries={sessions.map(session => [session, bills.filter(bill => bill.order.session === session).reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate).total, 0)])} />
        <Breakdown title="Collections by payment method" entries={methods.map(method => [method, collections.filter(payment => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0)])} />
        <Breakdown title="Popular dishes" count entries={[...itemCounts].sort((a, b) => b[1] - a[1]).slice(0, 6)} />
        <Breakdown title="Sales by order type" entries={['Dine-in', 'Parcel'].map(source => [source, bills.filter(bill => (bill.order.kind ?? 'Dine-in') === source).reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate).total, 0)])} />
      </div>
    </>}
  </>;
}
