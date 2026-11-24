'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, IndianRupee, LayoutGrid, Plus, ReceiptText, RefreshCw, Users, Utensils, Wallet } from 'lucide-react';
import { rupees, shortDate, timeZone, type Database, type Role, type Visit } from '../lib/demo';
import type { HistoryRow, OverviewResponse } from '../lib/history';
import { workspaceRequest } from '../lib/workspace-client';
import { guestLabel, Status, tableName } from './overview';
import { DataTable, Empty, type Column } from './ui';
import { TicketCard } from './ticket-card';

type OverviewPage = 'Dining tables' | 'Orders' | 'Bills' | 'Reports';
type ConnectedOverviewProps = {
  data: Database;
  role: Role;
  refresh?: number;
  onBill: (id: string) => void;
  openOrder: (order: Visit) => void;
  newOrder: () => void;
  go: (page: OverviewPage) => void;
};
const touchTarget = { minHeight: 44, touchAction: 'manipulation' } as const;
const money = (amount?: number) => amount === undefined ? '—' : rupees(amount, true);

function OrderPreview({ orders, count, data, openOrder }: {
  orders: Visit[]; count: number; data: Database; openOrder: (order: Visit) => void;
}) {
  if (!orders.length) return <Empty title={count ? 'More orders in the order list' : 'No orders here'}
    detail={count ? 'Open All Orders to see the latest records.' : 'New orders will appear here.'} />;
  return <div className="order-rows">{orders.map(order => <button type="button" className="order-row" key={order.id}
    style={touchTarget} aria-label={'Open order ' + order.id + ' for ' + guestLabel(order)} onClick={() => openOrder(order)}>
    <span className="row-icon">{order.status === 'Upcoming' ? <Clock3 size={19} aria-hidden="true" /> : <Utensils size={18} aria-hidden="true" />}</span>
    <span className="order-row-main" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{guestLabel(order)}</strong>
      <small>{order.status === 'Upcoming' ? shortDate(order.date) + ' · ' + order.time : order.kind === 'Parcel' ? 'Parcel' : tableName(data, order.table)} · {order.covers + (order.extraCovers ?? 0)} guests</small>
    </span><Status status={order.status} /><ArrowRight size={16} aria-hidden="true" />
  </button>)}</div>;
}

export function ConnectedOverview({ data, role, refresh = 0, onBill, openOrder, newOrder, go }: ConnectedOverviewProps) {
  const [days, setDays] = useState<'7' | '14'>('7');
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([role, refresh, days, retry]);
  const [result, setResult] = useState<{ key: string; value?: OverviewResponse; error?: string }>();
  const value = result?.key === requestKey && !result.error ? result.value : undefined;
  const error = result?.key === requestKey ? result.error : undefined;
  const loading = !value && !error;
  const owner = role === 'Owner';

  useEffect(() => {
    let active = true;
    // Ignore obsolete responses instead of aborting an instrumented dev fetch.
    // Deferring one microtask also skips Strict Mode's discarded first setup.
    queueMicrotask(() => {
      if (!active) return;
      workspaceRequest('overview?days=' + days)
        .then((response: OverviewResponse) => { if (active) setResult({ key: requestKey, value: response }); })
        .catch((cause: unknown) => {
          if (active) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : 'Could not load the overview. Please retry.' });
        });
    });
    return () => { active = false; };
  }, [days, requestKey]);

  const active = data.orders.filter(order => order.status === 'Open' && !order.guestLeftAt).slice(0, 4);
  const upcoming = data.orders.filter(order => order.status === 'Upcoming')
    .sort((left, right) => (left.date + left.time).localeCompare(right.date + right.time)).slice(0, 4);
  const max = value ? Math.max(1, ...value.trend.map(point => point.amount)) : 1;
  const billReference = (row: HistoryRow) => row.billId || row.id;
  const columns: Column<HistoryRow>[] = [
    { label: 'Bill no.', render: row => <button type="button" className="text-button" style={touchTarget} aria-label={'View bill ' + billReference(row)} onClick={() => onBill(billReference(row))}>{billReference(row)}</button> },
    { label: 'Guest', render: row => <strong style={{ overflowWrap: 'anywhere' }}>{row.guest || 'Walk-in guest'}</strong> },
    { label: 'Date (IST)', render: row => <span>{shortDate(row.date)} <small>{row.time}</small></span> },
    { label: 'Status', render: row => <Status status={row.status || 'Issued'} /> },
    ...(owner ? [{ label: 'Total charged', numeric: true, render: (row: HistoryRow) => <b>{money(row.total)}</b> }] : []),
  ];
  const cards = value ? [
    owner ? { label: 'Net sales today', value: money(value.netSales), icon: IndianRupee, detail: 'Includes GST · refunds deducted · tips excluded' }
      : { label: 'Open orders', value: value.activeCount, icon: Utensils, detail: 'Ready to resume' },
    { label: owner ? 'Bills issued' : 'Bills today', value: value.billsToday, icon: ReceiptText, detail: 'Bills issued today' },
    { label: 'Dining guests', value: value.guests, icon: Users, detail: 'Seated and served today' },
    owner ? { label: 'Average bill', value: money(value.averageBill), icon: Wallet, detail: 'Across today’s issued bills' }
      : { label: 'Upcoming orders', value: value.upcomingCount, icon: Clock3, detail: 'Phone and online orders' },
  ] : [];

  return <>
    <div className="overview-top service-hero">
      <div className="hero-copy">{value && <span className="date-label"><CalendarDays size={15} aria-hidden="true" />{new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone }).format(new Date(value.today + 'T12:00:00+05:30'))}</span>}
        <h1>Restaurant overview</h1><p>{owner ? 'Today’s orders, tables and sales at Sweet Rascal.' : 'Orders, guests and bills for today.'}</p>
      </div>
      <div className="hero-actions"><button type="button" className="btn hero-tables" style={touchTarget} onClick={() => go('Dining tables')}><LayoutGrid size={16} aria-hidden="true" />Dining Tables<ArrowUpRight size={15} aria-hidden="true" /></button>
        <button type="button" className="btn primary" style={touchTarget} onClick={newOrder}><Plus size={19} aria-hidden="true" />New Order</button></div>
    </div>
    <div aria-busy={loading}>
      {loading ? <section className="panel dashboard-section" role="status" aria-live="polite"><div className="section-head"><h2>Loading overview…</h2><RefreshCw size={20} aria-hidden="true" /></div><p>Fetching the latest service counts and summary.</p></section>
        : error ? <section className="panel dashboard-section" role="alert"><div className="section-head"><h2>Could not load the overview</h2></div><p style={{ overflowWrap: 'anywhere' }}>{error}</p><button type="button" className="btn secondary section-spacing" style={touchTarget} onClick={() => setRetry(previous => previous + 1)}><RefreshCw size={16} aria-hidden="true" />Retry Overview</button></section>
          : value && <>
            <div className="metrics service-metrics">{cards.map(({ label, value: cardValue, icon: Icon, detail }) => <section className="panel metric" key={label}><div className="metric-top"><span className="metric-icon"><Icon size={19} aria-hidden="true" /></span><span>{label}</span></div><strong>{cardValue}</strong><small>{detail}</small></section>)}</div>
            <div className={'dashboard-grid service-grid' + (owner ? '' : ' cashier-grid')}>
              {owner && <section className="panel sales-panel">
                <div className="section-head"><div><h2>Issued sales</h2><p>Daily sales including GST · tips excluded · before refunds</p></div>
                  <select className="overview-period" name="overview-days" style={touchTarget} aria-label="Sales overview period" value={days} onChange={event => setDays(event.target.value as '7' | '14')}><option value="7">Last 7 days</option><option value="14">Last 14 days</option></select></div>
                {value.trend.length ? <ul className="sales-chart" style={{ gridTemplateColumns: `repeat(${value.trend.length}, minmax(0, 1fr))` }} aria-label={'Daily issued sales for the last ' + days + ' days'}>
                  {value.trend.map(point => <li key={point.day} title={shortDate(point.day) + ' · ' + money(point.amount)}>
                    <div className="sales-track" aria-hidden="true"><span className={point.day === value.today ? 'current' : ''} style={{ height: Math.max(0, point.amount / max * 100) + '%' }} /></div>
                    <span>{days === '14' ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone }).format(new Date(point.day + 'T12:00:00+05:30')) : shortDate(point.day)}<span className="sr-only">: {money(point.amount)}</span></span>
                  </li>)}
                </ul> : <Empty title="No sales in this period" detail="Issued sales will appear here." />}
                <button type="button" className="text-button sales-report-link" style={touchTarget} onClick={() => go('Reports')}>View Reports<ArrowRight size={15} aria-hidden="true" /></button>
              </section>}
              <section className="panel dashboard-section"><div className="section-head"><div><h2>Open orders</h2><p>{value.activeCount} in service</p></div><button type="button" className="text-button" style={touchTarget} onClick={() => go('Orders')}>All Orders<ArrowRight size={15} aria-hidden="true" /></button></div>
                <OrderPreview orders={active} count={value.activeCount} data={data} openOrder={openOrder} /></section>
              <section className="panel dashboard-section"><div className="section-head"><div><h2>Upcoming</h2><p>Phone and online orders</p></div><span className="count">{value.upcomingCount} scheduled</span></div>
                <OrderPreview orders={upcoming} count={value.upcomingCount} data={data} openOrder={openOrder} /></section>
            </div>
            {owner && <div className="overview-insights section-spacing">
              <section className="panel dashboard-section"><div className="section-head"><h2>Top dishes today</h2><Utensils size={18} aria-hidden="true" /></div>
                {value.topDishes.length ? <ul className="overview-dish-list">{value.topDishes.map(dish => <li key={dish.name}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{dish.name}</span><b>{dish.quantity} ordered</b></li>)}</ul> : <Empty title="No dishes sold today" />}
              </section>
              <section className="panel dashboard-section"><div className="section-head"><h2>Today’s sales details</h2><ReceiptText size={18} aria-hidden="true" /></div>
                <dl className="totals"><div><dt>Issued sales including GST</dt><dd>{money(value.sales)}</dd></div><div><dt>Refunded sales today</dt><dd>{money(value.returnedSales)}</dd></div>
                  <div><dt>Tips on today’s bills</dt><dd>{money(value.tips)}</dd></div><div><dt>Dine-in / parcel bills</dt><dd>{value.dineIn ?? '—'} / {value.parcel ?? '—'}</dd></div></dl>
                <button type="button" className="text-button" style={touchTarget} onClick={() => go('Reports')}>Filter & Download Records<ArrowRight size={15} aria-hidden="true" /></button>
              </section>
            </div>}
            <div className="section-head section-spacing"><div><h2>Recent bills</h2><p>{owner ? 'Latest bills across the restaurant' : 'Latest service bills'}</p></div><button type="button" className="text-button" style={touchTarget} onClick={() => go('Bills')}>View All Bills<ArrowRight size={15} aria-hidden="true" /></button></div>
            <DataTable rows={value.recent} pageSize={20} columns={columns} empty="No recent bills"
              mobileCard={row => <TicketCard reference={billReference(row)} guest={row.guest || 'Walk-in guest'} context={[shortDate(row.date), row.time, row.kind].filter(Boolean).join(' · ')}
                status={<Status status={row.status || 'Issued'} />} amount={owner ? <b>{money(row.total)}</b> : undefined}
                action="View Bill" actionLabel={'View bill ' + billReference(row)} onOpen={() => onBill(billReference(row))} />} />
          </>}
    </div>
  </>;
}
