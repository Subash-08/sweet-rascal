'use client';

import { useState } from 'react';
import { ArrowRight, Clock3, Package, ReceiptText, Utensils } from 'lucide-react';
import { type Bill, type Database, type Visit, payable, rupees, sumPayments, timeZone } from '../lib/demo';
import { guestLabel, tableName } from './overview';
import { Badge, DataTable, Dialog, Title } from './ui';
import { TicketCard } from './ticket-card';

export function BillingDesk({ data, open, view, closeVisit, startParcel }: {
  data: Database; open: (visit: Visit) => void; view: (bill: Bill) => void;
  closeVisit: (visit: Visit) => void; startParcel: () => void;
}) {
  const [tab, setTab] = useState('Waiting for bill');
  const [departing, setDeparting] = useState<Visit>();
  const settled = (visit: Visit) => data.bills.find(bill => bill.order.id === visit.id);
  const live = data.orders.filter(visit => visit.status === 'Open' || visit.status === 'Upcoming' || visit.status === 'Draft');
  const ready = live.filter(visit => visit.readyForBilling || visit.guestLeftAt || visit.discount?.pending || (visit.payments?.length ?? 0) > 0);
  const issued = data.orders.filter(visit => visit.status === 'Billed' && settled(visit));
  const rows = tab === 'Waiting for bill' ? ready : tab === 'Open orders' ? live : issued;
  function ticketStatus(visit: Visit, bill?: Bill) {
    if (bill?.voided) return <Badge tone="red">Voided</Badge>;
    if (visit.guestLeftAt) {
      if (bill) return <Badge tone="green">Completed</Badge>;
      return <Badge tone={amount(visit) === 0 ? 'blue' : 'amber'}>{amount(visit) === 0 ? 'Paid · bill pending' : 'Departed · balance due'}</Badge>;
    }
    if (bill) return <Badge tone="green">Paid</Badge>;
    if (visit.discount?.pending) return <Badge tone="amber">Discount approval needed</Badge>;
    return <Badge tone={visit.readyForBilling ? 'blue' : 'gray'}>{visit.readyForBilling ? 'Waiting for bill' : visit.status === 'Open' ? 'Order taken' : visit.status}</Badge>;
  }
  function amount(visit: Visit, bill?: Bill) {
    const total = payable(bill?.order ?? visit, bill?.taxRate ?? data.business.taxRate);
    return bill ? total : Math.max(0, total - (visit.advance?.amount ?? 0) - sumPayments(visit.payments ?? []));
  }
  return <>
    <Title title="Billing desk" subtitle="Review orders, settle payments and share customer bills." action={<button className="btn primary" onClick={startParcel}><Package size={17} /> New parcel</button>} />
    <section className="desk-banner"><ReceiptText size={24} /><div><h2>{ready.length} waiting for bill</h2><p>Open a ticket to check the dishes, guest details and balance.</p></div></section>
    <div className="chips view-tabs desk-tabs">{[['Waiting for bill', ready.length], ['Open orders', live.length], ['Issued bills', issued.length]].map(([name, count]) => <button key={name} className={tab === name ? 'active' : ''} aria-pressed={tab === name} onClick={() => setTab(String(name))}>{name}<span aria-hidden="true">{count}</span></button>)}</div>
    <DataTable rows={rows} search={visit => [visit.id, guestLabel(visit), tableName(data, visit.table), visit.kind ?? 'Dine-in', settled(visit)?.id ?? ''].join(' ')}
      placeholder="Search order, guest or table…" empty={tab === 'Waiting for bill' ? 'No orders waiting for billing' : 'No orders in this view'}
      mobileCard={visit => {
        const bill = settled(visit);
        const canDepart = bill && !visit.guestLeftAt && visit.takenAt;
        return <TicketCard reference={bill?.id ?? visit.id} guest={guestLabel(visit)}
          context={visit.kind === 'Parcel' ? 'Parcel' : tableName(data, visit.table)}
          status={ticketStatus(visit, bill)} amount={<><small>{bill ? 'Total charged' : 'Amount due'}</small><b>{rupees(amount(visit, bill), true)}</b></>}
          action={canDepart ? visit.kind === 'Parcel' ? 'Mark collected' : 'Confirm departure' : bill ? 'Open bill' : 'Review order'}
          secondaryAction={bill && canDepart ? <div className="ticket-card-footer"><button className="text-button" onClick={() => view(bill)} aria-label={'Open bill ' + bill.id}>Open bill <ArrowRight size={15} /></button></div> : undefined}
          onOpen={() => { if (canDepart) setDeparting(visit); else if (bill) view(bill); else open(visit); }} />;
      }} columns={[
        { label: 'Ticket', render: visit => <button className="text-button" onClick={() => { const bill = settled(visit); if (bill) view(bill); else open(visit); }}>{settled(visit)?.id ?? visit.id} <ArrowRight size={15} /></button>, sort: visit => visit.updatedAt ?? visit.date },
        { label: 'Guest', render: visit => guestLabel(visit), sort: guestLabel },
        { label: 'Service', render: visit => <span className="desk-service">{visit.kind === 'Parcel' ? <Package size={15} /> : <Utensils size={15} />}{visit.kind === 'Parcel' ? 'Parcel' : tableName(data, visit.table)}</span> },
        { label: 'Status', render: visit => ticketStatus(visit, settled(visit)) },
        { label: tab === 'Issued bills' ? 'Total' : 'Amount due', numeric: true, render: visit => <b>{rupees(amount(visit, settled(visit)), true)}</b> },
        { label: 'Actions', render: visit => {
          const bill = settled(visit);
          if (bill && !visit.guestLeftAt && visit.takenAt) return <button className="btn secondary compact" onClick={() => setDeparting(visit)}>{visit.kind === 'Parcel' ? 'Mark collected' : 'Confirm departure'}</button>;
          if (bill) return <button className="btn secondary compact" onClick={() => view(bill)}>Open bill</button>;
          return <button className="btn secondary compact" onClick={() => open(visit)}>Review order</button>;
        } },
      ]} />
    {departing && <Dialog title={departing.kind === 'Parcel' ? 'Mark parcel collected?' : 'Record guest departure?'} close={() => setDeparting(undefined)}>
      <p>The bill and payment history will stay available.</p>
      <div className="dialog-actions"><button className="btn secondary" onClick={() => setDeparting(undefined)}>Cancel</button><button className="btn primary" onClick={() => { closeVisit(departing); setDeparting(undefined); }}>Confirm</button></div>
    </Dialog>}
  </>;
}

const dateTime = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'medium' });
export function Activity({ data }: { data: Database }) {
  const rows = data.orders.flatMap(visit => (visit.events ?? []).map(entry => ({ ...entry, order: visit.id }))).sort((a, b) => b.at.localeCompare(a.at));
  return <><Title title="Service activity" subtitle="Review the time and staff member behind order updates and corrections." />
    <DataTable rows={rows} search={entry => [entry.order, entry.actor, entry.action, entry.detail].join(' ')} placeholder="Find an order, action or staff member…"
      mobileCard={entry => <TicketCard reference={entry.order} guest={entry.action} status={<Badge>{entry.actor}</Badge>}
        context={[dateTime.format(new Date(entry.at)) + ' IST', entry.detail].filter(Boolean).join(' · ')} />}
      empty="No service events recorded yet" columns={[
        { label: 'Time (IST)', render: entry => <span className="desk-service"><Clock3 size={15} />{dateTime.format(new Date(entry.at))}</span>, sort: entry => entry.at },
        { label: 'Order', render: entry => entry.order, sort: entry => entry.order },
        { label: 'Staff member', render: entry => entry.actor, sort: entry => entry.actor },
        { label: 'Event', render: entry => <strong>{entry.action}</strong> },
        { label: 'Details', render: entry => entry.detail || '—' },
      ]} />
  </>;
}
