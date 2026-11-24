'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, IndianRupee, LayoutGrid, Plus, ReceiptText, Users, Utensils, Wallet } from 'lucide-react';
import { type Bill, type Database, type Refund, type Role, type Visit, payable, refundTotal, rupees, serviceDay, shortDate, timeZone, totals } from '../lib/demo';
import { Badge, DataTable, Empty } from './ui';
import { TicketCard } from './ticket-card';

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
  const [range, setRange] = useState('7');
  const today = serviceDay();
  const days = Array.from({ length: Number(range) }, (_, index) => daysBefore(today, Number(range) - 1 - index));
  const amounts = days.map(day => bills.reduce((sum, bill) => !bill.voided && bill.date === day ? sum + totals(bill.order.items, bill.taxRate, bill.order.discount).total : sum, 0));
  const groups = range === '14' ? days.filter((_, index) => index % 2 === 0).map((day, index) => ({ day, end: days[index * 2 + 1], amount: amounts[index * 2] + amounts[index * 2 + 1] })) : days.map((day, index) => ({ day, end: day, amount: amounts[index] }));
  const max = Math.max(...groups.map(group => group.amount), 1);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);

  return <section className="panel sales-panel">
    <div className="section-head"><div><h2>Issued sales</h2><p>Before refunds · tips excluded{range === '14' ? ' · two days per bar' : ''}</p></div><select className="overview-period" aria-label="Sales overview period" value={range} onChange={event => setRange(event.target.value)}><option value="7">Last 7 days</option><option value="14">Last 14 days</option></select></div>
    <strong className="sales-amount">{rupees(total)}</strong>
    <ul className="sales-chart" aria-label={'Sales for the last ' + range + ' days'}>
      {groups.map(({ day, end, amount }) => <li key={day} title={(day === end ? shortDate(day) : shortDate(day) + ' – ' + shortDate(end)) + ' · ' + rupees(amount)}>
        <div className="sales-track"><span className={end === today ? 'current' : ''} style={{ height: (amount / max * 100) + '%' }} /></div>
        <span>{shortDate(day)}<span className="sr-only">{end !== day && ' – ' + shortDate(end)}: {rupees(amount)}</span></span>
      </li>)}
    </ul>
    <button className="text-button sales-report-link" onClick={openReports}>View reports <ArrowRight size={15} /></button>
  </section>;
}

export function BillList({ bills, view, compact = false, refunds = [] }: { bills: Bill[]; view: (bill: Bill) => void; compact?: boolean; refunds?: Refund[] }) {
  const [status, setStatus] = useState('All statuses');
  const billStatus = (bill: Bill) => bill.voided ? 'Voided' : refunds.some(refund => refund.billId === bill.id && refund.cancelled) ? 'Cancelled' :
    refundTotal(refunds, bill.id) > 0 ? refundTotal(refunds, bill.id) >= payable(bill.order, bill.taxRate) ? 'Refunded' : 'Part refunded' : 'Paid';
  const visible = bills.filter(bill => status === 'All statuses' || billStatus(bill) === status);
  return <DataTable rows={visible} pageSize={compact ? 4 : 8} search={compact ? undefined : bill => bill.id + ' ' + guestLabel(bill.order)}
    mobileCard={bill => <TicketCard reference={bill.id} guest={guestLabel(bill.order)} context={shortDate(bill.date) + ' · ' + bill.time}
      status={<Status status={billStatus(bill)} />} amount={<b>{rupees(payable(bill.order, bill.taxRate))}</b>} action="View bill" onOpen={() => view(bill)} />}
    placeholder="Search bill or guest…" filters={compact ? undefined : <select aria-label="Bill status" value={status} onChange={e => setStatus(e.target.value)}>{['All statuses', 'Paid', 'Part refunded', 'Refunded', 'Cancelled', 'Voided'].map(value => <option key={value}>{value}</option>)}</select>}
    columns={[
      { label: 'Bill no.', render: bill => <button className="text-button" onClick={() => view(bill)}>{bill.id}</button>, sort: bill => bill.id },
      { label: 'Guest', render: bill => <strong>{guestLabel(bill.order)}</strong>, sort: bill => guestLabel(bill.order) },
      { label: 'Date', render: bill => <span>{shortDate(bill.date)} <small>{bill.time}</small></span>, sort: bill => bill.date + bill.time },
      { label: 'Status', render: bill => <Status status={billStatus(bill)} /> },
      { label: 'Total charged', numeric: true, render: bill => <b>{rupees(payable(bill.order, bill.taxRate))}</b>, sort: bill => payable(bill.order, bill.taxRate) },
    ]} empty="No bills in this view" />;
}
function OrderRows({ orders, data, open }: { orders: Visit[]; data: Database; open: (order: Visit) => void }) {
  return orders.length ? <div className="order-rows">{orders.map(order => <button className="order-row" key={order.id} onClick={() => open(order)}>
    <span className="row-icon">{order.status === 'Upcoming' ? <Clock3 size={19} /> : <Utensils size={18} />}</span>
    <span className="order-row-main"><strong>{guestLabel(order)}</strong><small>{order.status === 'Upcoming' ? shortDate(order.date) + ' · ' + order.time : tableName(data, order.table)} · {order.covers + (order.extraCovers ?? 0)} guests</small></span>
    <Status status={order.status} /><ArrowRight size={16} />
  </button>)}</div> : <Empty title="No orders here" detail="New orders will appear here." />;
}

export function Dashboard({ data, role, open, newOrder, viewBill, go }: { data: Database; role: Role; open: (order: Visit) => void; newOrder: () => void; viewBill: (bill: Bill) => void; go: (page: 'Dining tables' | 'Orders' | 'Bills' | 'Reports') => void }) {
  const today = serviceDay();
  const active = data.orders.filter(order => order.status === 'Open' && !order.guestLeftAt);
  const upcoming = data.orders.filter(order => order.status === 'Upcoming').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const billsToday = data.bills.filter(bill => bill.date === today && !bill.voided);
  const sales = billsToday.reduce((sum, bill) => sum + totals(bill.order.items, bill.taxRate, bill.order.discount).total, 0);
  const refundsToday = (data.refunds ?? []).filter(refund => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(refund.at)) === today);
  const returnedSales = refundsToday.reduce((sum, refund) => sum + refund.salesAmount, 0);
  const topDishes = new Map<string, number>();
  for (const bill of billsToday) for (const item of bill.order.items) topDishes.set(item.name, (topDishes.get(item.name) ?? 0) + item.quantity);
  const ranked = [...topDishes].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const covers = [...billsToday.map(bill => bill.order), ...active.filter(order => order.date === today)]
    .filter(order => order.kind !== 'Parcel')
    .reduce((sum, order) => sum + order.covers + (order.extraCovers ?? 0), 0);
  const cards = [
    role === 'Staff' ? { label: 'Open orders', value: active.length, icon: Utensils, detail: 'Ready to resume' } : { label: 'Net sales today', value: rupees(sales - returnedSales), icon: IndianRupee, detail: 'Includes GST · refunds deducted · tips excluded' },
    { label: role === 'Staff' ? 'Bills today' : 'Bills issued', value: billsToday.length, icon: ReceiptText, detail: 'Paid bills today' },
    { label: 'Dining guests', value: covers, icon: Users, detail: role === 'Staff' ? 'During today’s service' : 'Seated and served today' },
    role === 'Staff' ? { label: 'Upcoming orders', value: upcoming.length, icon: Clock3, detail: 'Phone and online orders' } : { label: 'Average bill', value: rupees(billsToday.length ? Math.round(sales / billsToday.length) : 0), icon: Wallet, detail: 'Across today’s paid bills' },
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
      <section className="panel dashboard-section"><div className="section-head"><div><h2>Upcoming</h2><p>Phone and online orders</p></div><span className="count">{upcoming.length} scheduled</span></div><OrderRows orders={upcoming.slice(0, 4)} data={data} open={open} /></section>
    </div>
    {role === 'Owner' && <div className="overview-insights section-spacing">
      <section className="panel dashboard-section"><div className="section-head"><h2>Top dishes today</h2><Utensils size={18} aria-hidden="true" /></div>
        {ranked.length ? <ul className="overview-dish-list">{ranked.map(([name, quantity]) => <li key={name}><span>{name}</span><b>{quantity} ordered</b></li>)}</ul> : <Empty title="No dishes sold today" />}
      </section>
      <section className="panel dashboard-section"><div className="section-head"><h2>Today’s sales details</h2><ReceiptText size={18} aria-hidden="true" /></div>
        <dl className="totals">
          <div><dt>Issued sales including GST</dt><dd>{rupees(sales, true)}</dd></div>
          <div><dt>Refunded sales today</dt><dd>{rupees(returnedSales, true)}</dd></div>
          <div><dt>Tips on today’s bills</dt><dd>{rupees(billsToday.reduce((sum, bill) => sum + (bill.order.tip ?? 0), 0), true)}</dd></div>
          <div><dt>Dine-in / parcel bills</dt><dd>{billsToday.filter(bill => bill.order.kind !== 'Parcel').length} / {billsToday.filter(bill => bill.order.kind === 'Parcel').length}</dd></div>
        </dl><button className="text-button" onClick={() => go('Reports')}>Filter and download records <ArrowRight size={15} /></button>
      </section>
    </div>}
    <div className="section-head section-spacing"><div><h2>Recent bills</h2><p>{role === 'Staff' ? 'Latest service bills' : 'Latest bills across the restaurant'}</p></div><button className="text-button" onClick={() => go('Bills')}>View all bills <ArrowRight size={15} /></button></div>
    <BillList bills={data.bills.slice(0, 4)} refunds={data.refunds} view={viewBill} compact />
  </>;
}
