'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CalendarDays, ChartNoAxesCombined, CreditCard, HandCoins, IndianRupee, Package, ReceiptText, Smartphone, TriangleAlert, Utensils } from 'lucide-react';
import { type Bill, type Database, type Payment, type Visit, payable, rupees, serviceDay, shortDate, sumPayments, timeZone, totals } from '../lib/demo';
import { BillList, guestLabel, tableName } from './overview';
import { Badge, DataTable, Empty, Field } from './ui';
import '../app/reports.css';

const dayMs = 86_400_000;
const dayTime = (day: string) => Date.parse(day + 'T00:00:00Z');
const shift = (day: string, count: number) => new Date(dayTime(day) + count * dayMs).toISOString().slice(0, 10);
const period = (from: string, to: string) => from === to ? shortDate(from) : shortDate(from) + ' – ' + shortDate(to);
const sale = (bill: Bill) => totals(bill.order.items, bill.taxRate, bill.order.discount);
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const paymentMethods = [
  { name: 'Cash', icon: Banknote, color: '#922a27' },
  { name: 'UPI', icon: Smartphone, color: '#d0583f' },
  { name: 'Card', icon: CreditCard, color: '#edab83' },
] as const;

function SalesTrend({ from, to, bills }: { from: string; to: string; bills: Bill[] }) {
  const days = Math.round((dayTime(to) - dayTime(from)) / dayMs) + 1;
  const step = Math.ceil(days / 12);
  const buckets = Array.from({ length: Math.ceil(days / step) }, (_, index) => {
    const start = shift(from, index * step);
    const end = shift(from, Math.min(days - 1, (index + 1) * step - 1));
    const amount = bills.filter(bill => bill.date >= start && bill.date <= end).reduce((sum, bill) => sum + sale(bill).total, 0);
    return { start, end, amount };
  });
  const [selected, setSelected] = useState<string>();
  const peak = buckets.reduce((best, bucket) => bucket.amount > best.amount ? bucket : best);
  const active = buckets.find(bucket => bucket.start === selected) ?? peak;
  return <section className="panel report-card report-trend">
    <div className="report-card-head"><div><h2>Sales over time</h2><p>Issued bills, including tax</p></div><ChartNoAxesCombined size={22} aria-hidden="true" /></div>
    {bills.length ? <>
      <div className="trend-reading" aria-live="polite"><span>{period(active.start, active.end)}</span><strong>{rupees(active.amount)}</strong></div>
      <div className="trend-bars" aria-label="Select a period to see its sales">
        {buckets.map(bucket => <button key={bucket.start} className="trend-bar" aria-pressed={active.start === bucket.start}
          aria-label={period(bucket.start, bucket.end) + ': ' + rupees(bucket.amount)} onClick={() => setSelected(bucket.start)}>
          <span className="trend-track"><i style={{ height: Math.max(2, bucket.amount / Math.max(1, peak.amount) * 100) + '%' }} /></span>
          <small>{shortDate(bucket.start)}</small>
        </button>)}
      </div>
    </> : <Empty title="No issued bills in this period" detail="Choose another date range to see sales." />}
  </section>;
}

function CollectionMix({ payments }: { payments: Payment[] }) {
  const collected = sumPayments(payments);
  let cursor = 0;
  const slices = paymentMethods.map(method => {
    const matching = payments.filter(payment => payment.method === method.name);
    const amount = sumPayments(matching);
    const share = collected ? amount / collected * 100 : 0;
    const start = cursor;
    cursor += share;
    return { ...method, amount, share, start, count: matching.length };
  });
  const gradient = collected ? 'conic-gradient(' + slices.map(slice => slice.color + ' ' + slice.start + '% ' + (slice.start + slice.share) + '%').join(', ') + ')' : undefined;
  return <section className="panel report-card">
    <div className="report-card-head"><div><h2>Payment mix</h2><p>By date payment was recorded</p></div><CreditCard size={21} aria-hidden="true" /></div>
    <div className="report-donut" style={{ background: gradient }}><div><small>Collected</small><strong>{rupees(collected)}</strong></div></div>
    <ul className="report-legend">{slices.map(({ name, icon: Icon, color, amount, share, count }) => <li key={name}>
      <Icon size={17} style={{ color }} aria-hidden="true" /><div><b>{name}</b><small>{count} {count === 1 ? 'payment' : 'payments'}</small></div>
      <div><b>{rupees(amount)}</b><small>{Math.round(share)}%</small></div>
    </li>)}</ul>
  </section>;
}

export function Reports({ data, viewBill, openOrder }: { data: Database; viewBill: (bill: Bill) => void; openOrder: (order: Visit) => void }) {
  const today = serviceDay();
  const [from, setFrom] = useState(() => shift(today, -6));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState('Last 7 days');
  const [rankBy, setRankBy] = useState<'quantity' | 'revenue'>('quantity');
  const [ledger, setLedger] = useState('Bills');
  const valid = Boolean(from && to && from <= to);
  const inRange = (date: string) => valid && date >= from && date <= to;
  const paidBills = data.bills.filter(bill => !bill.voided);
  const bills = paidBills.filter(bill => inRange(bill.date));
  const voids = data.bills.filter(bill => bill.voided && inRange(bill.date));
  const { sales, tax, tips } = bills.reduce((sum, bill) => {
    const amount = sale(bill);
    return { sales: sum.sales + amount.total, tax: sum.tax + amount.tax * 2, tips: sum.tips + (bill.order.tip ?? 0) };
  }, { sales: 0, tax: 0, tips: 0 });
  const span = valid ? Math.round((dayTime(to) - dayTime(from)) / dayMs) + 1 : 0;
  const priorStart = valid ? shift(from, -span) : '';
  const priorSales = paidBills.filter(bill => bill.date < from && bill.date >= priorStart).reduce((sum, bill) => sum + sale(bill).total, 0);
  const change = priorSales ? Math.round((sales - priorSales) / priorSales * 100) : null;
  const billedIds = new Set(data.bills.map(bill => bill.order.id));
  const open = data.orders.filter(order => !billedIds.has(order.id) && order.status !== 'Cancelled' && order.status !== 'Billed');
  const advances = [...paidBills.map(bill => bill.order), ...open].flatMap(order => order.advance && inRange(order.advance.date) ? [order.advance] : []);
  const payments = [...paidBills.flatMap(bill => bill.payments), ...open.flatMap(order => order.payments ?? [])].filter(payment => inRange(payment.date)).concat(advances);
  const outstanding = open.flatMap(order => {
    if (!order.guestLeftAt || !inRange(localDate.format(new Date(order.guestLeftAt)))) return [];
    const due = payable(order, data.business.taxRate) - (order.advance?.amount ?? 0) - sumPayments(order.payments ?? []);
    return due > 0 ? [{ ...order, due }] : [];
  });
  const orders = data.orders.filter(order => order.status !== 'Cancelled' && inRange(order.date));
  const dishes = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();
  for (const bill of bills) for (const line of bill.order.items) {
    const key = line.name.trim().toLowerCase();
    const item = dishes.get(key) ?? { id: key, name: line.name, quantity: 0, revenue: 0 };
    item.quantity += line.quantity;
    item.revenue += line.price * line.quantity;
    dishes.set(key, item);
  }
  const ranked = [...dishes.values()].sort((a, b) => b[rankBy] - a[rankBy] || a.name.localeCompare(b.name));
  const sessions = new Map<string, number>();
  for (const bill of bills) sessions.set(bill.order.session, (sessions.get(bill.order.session) ?? 0) + sale(bill).total);
  const sessionSales = [...sessions].sort((a, b) => b[1] - a[1]);
  const presets = { Today: today, 'Last 7 days': shift(today, -6), 'This month': today.slice(0, 8) + '01' };
  const kpis = [
    { label: 'Total sales', value: rupees(sales), hint: 'Includes GST · excludes tips', icon: IndianRupee },
    { label: 'Payments collected', value: rupees(sumPayments(payments)), hint: 'Includes advances and tips received', icon: HandCoins },
    { label: 'Paid bills', value: bills.length, hint: 'Excludes voided bills', icon: ReceiptText },
    { label: 'Average bill', value: bills.length ? rupees(Math.round(sales / bills.length)) : '—', hint: 'Sales per paid bill', icon: ChartNoAxesCombined },
  ];

  return <div className="reports">
    <header className="report-hero"><div><p className="report-period"><CalendarDays size={16} /> {valid ? period(from, to) : 'Select a date range'} · IST</p><h1>Reports</h1><p>Sales, payments, and service at Sweet Rascal.</p></div><div className="report-hero-icon"><ChartNoAxesCombined size={35} strokeWidth={1.5} aria-hidden="true" /></div></header>
    <section className="panel report-filters" aria-label="Report period">
      <div className="chips">{Object.entries(presets).map(([name, start]) => <button key={name} className={range === name ? 'active' : ''} aria-pressed={range === name} onClick={() => { setRange(name); setFrom(start); setTo(today); }}>{name}</button>)}
        <button className={range === 'Custom' ? 'active' : ''} aria-pressed={range === 'Custom'} onClick={() => { setRange('Custom'); document.getElementById('report-from')?.focus(); }}>Custom</button>
      </div>
      <div className="report-date-fields">
        <label className="field" htmlFor="report-from">Start date<input id="report-from" type="date" value={from} onChange={event => { setFrom(event.target.value); setRange('Custom'); }} /></label>
        <Field label="End date"><input type="date" value={to} onChange={event => { setTo(event.target.value); setRange('Custom'); }} /></Field>
      </div>
    </section>
    {!valid ? <p className="error" role="alert">Choose a start date on or before the end date.</p> : <>
      <div className="report-kpis">{kpis.map(({ label, value, hint, icon: Icon }, index) => <section className="panel report-kpi" key={label}>
        <div><span>{label}</span><i><Icon size={18} aria-hidden="true" /></i></div><strong>{value}</strong>
        {index === 0 && change !== null && <p className="report-change" data-fell={change < 0}>{change < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{Math.abs(change)}% vs previous {span === 1 ? 'day' : span + ' days'}</p>}
        <small>{hint}</small>
      </section>)}</div>
      <div className="report-grid report-primary"><SalesTrend key={from + ':' + to} from={from} to={to} bills={bills} /><CollectionMix payments={payments} /></div>
      <div className="report-grid">
        <section className="panel report-card">
          <div className="report-card-head"><div><h2>Top dishes</h2><p>From paid bills · before tax and bill discounts</p></div><select aria-label="Rank dishes by" value={rankBy} onChange={event => setRankBy(event.target.value as typeof rankBy)}><option value="quantity">By quantity</option><option value="revenue">By sales</option></select></div>
          {ranked.length ? <ol className="report-ranking">{ranked.slice(0, 7).map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.name}</b><small>{item.quantity} sold</small></div><strong>{rupees(item.revenue)}</strong></li>)}</ol> : <Empty title="No dishes sold in this period" />}
        </section>
        <section className="panel report-card">
          <div className="report-card-head"><div><h2>Service breakdown</h2><p>Sales and bill count by service type</p></div><Utensils size={21} aria-hidden="true" /></div>
          <div className="report-service">{(['Dine-in', 'Parcel'] as const).map(kind => {
            const group = bills.filter(bill => (bill.order.kind ?? 'Dine-in') === kind);
            const Icon = kind === 'Parcel' ? Package : Utensils;
            return <div key={kind}><Icon size={18} aria-hidden="true" /><span>{kind}<small>{group.length} {group.length === 1 ? 'bill' : 'bills'}</small></span><b>{rupees(group.reduce((sum, bill) => sum + sale(bill).total, 0))}</b></div>;
          })}</div>
          <h3 className="report-subhead">Sales by meal session</h3>
          {sessionSales.length ? <ul className="report-meals">{sessionSales.map(([name, value]) => <li key={name}><div><span>{name}</span><b>{rupees(value)}</b></div><div className="bar-track"><span style={{ width: (sales ? value / sales * 100 : 0) + '%' }} /></div></li>)}</ul> : <p className="report-muted">No meal sessions recorded.</p>}
        </section>
      </div>
      <section className="panel report-card">
        <div className="report-card-head"><div><h2>Day-end review</h2><p>Totals for the selected range</p></div><TriangleAlert size={21} aria-hidden="true" /></div>
        <dl className="report-closeout">{[
          ['GST on issued bills', rupees(tax)], ['Tips on issued bills', rupees(tips)], ['Advances collected', rupees(sumPayments(advances))],
          ['Unpaid departures', rupees(outstanding.reduce((sum, order) => sum + order.due, 0))], ['Voided bills', voids.length], ['Orders by visit date', orders.length],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>
      <section className="report-ledger">
        <div className="report-card-head"><div><h2>Records</h2><p>Open a bill or follow up on a balance.</p></div></div>
        <div className="chips view-tabs">{[['Bills', bills.length], ['Unpaid departures', outstanding.length], ['Voids', voids.length]].map(([name, count]) => <button key={name} aria-pressed={ledger === name} className={ledger === name ? 'active' : ''} onClick={() => setLedger(String(name))}>{name} <span className="count">{count}</span></button>)}</div>
        {ledger === 'Unpaid departures' ? <DataTable rows={outstanding} empty="No unpaid departures in this period" columns={[
          { label: 'Order', render: order => <button className="text-button" onClick={() => openOrder(order)}>{order.id} <ArrowRight size={14} /></button> },
          { label: 'Guest', render: guestLabel }, { label: 'Service', render: order => order.kind === 'Parcel' ? 'Parcel' : tableName(data, order.table) },
          { label: 'Status', render: () => <Badge tone="amber">Balance due</Badge> }, { label: 'Amount due', numeric: true, render: order => <b>{rupees(order.due)}</b> },
        ]} /> : <BillList key={ledger} bills={ledger === 'Voids' ? voids : bills} view={viewBill} />}
      </section>
    </>}
  </div>;
}
