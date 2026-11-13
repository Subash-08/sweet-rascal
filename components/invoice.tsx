'use client';

import { useId, useState, type ReactNode } from 'react';
import { ArrowLeft, Coffee, ExternalLink, MessageCircle, Printer } from 'lucide-react';
import { type Bill, rupees, sessions, shortDate, sumPayments, totals } from '../lib/demo';
import { Dialog, Title } from './ui';
import '../app/invoice.css';

export type InvoiceShareEvent = {
  billId: string;
  channel: 'WhatsApp';
  action: 'opened';
  at: string;
};

export type BillPreviewProps = {
  bill: Bill;
  table: string;
  close: () => void;
  canVoid: boolean;
  onVoid: () => void;
  onShare?: (event: InvoiceShareEvent) => void;
  onDeparture?: () => void;
};

const money = (amount: number) => rupees(amount, true);
const relationshipOptions = ['Solo', 'Family', 'Friends', 'Girl Friend / ’s', 'Companion'];
const ratingOptions = ['Super friendly', 'Friendly', 'Unfriendly', 'Reserved', 'Arrogant', 'Pain in the neck'];

function formatDate(date: string) {
  return date ? shortDate(date) + ' ' + date.slice(0, 4) : '';
}

function Mark({ name }: { name: string }) {
  return (
    <div className="sr-invoice-mark">
      <svg viewBox="0 0 92 54" width="76" height="45" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinejoin="round">
        <path d="M35 47C28 42 5 28 5 17 5 5 22 1 29 12 36 1 53 5 53 17c0 11-18 24-24 28" />
        <path d="M62 49c-6-4-25-17-25-28 0-12 16-16 25-5 8-11 25-7 25 5 0 11-19 24-25 28Z" />
      </svg>
      <strong>“{name}”</strong>
    </div>
  );
}

function RuledField({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="sr-invoice-field"><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

function Tick({ label, checked }: { label: string; checked: boolean }) {
  return <li className="sr-invoice-tick"><span>{label}</span><span className="sr-invoice-box" aria-label={checked ? 'Selected' : 'Unselected'}>{checked ? '✓' : ''}</span></li>;
}

function Choices({ options, value, label }: { options: string[]; value?: string; label: string }) {
  const selected = value?.trim();
  const normalized = selected?.toLowerCase();
  const labels = selected && !options.some(option => option.toLowerCase() === normalized) ? [...options, selected] : options;
  return <ul className="sr-invoice-choices" aria-label={label}>{labels.map(option => <Tick key={option} label={option} checked={option.toLowerCase() === normalized} />)}</ul>;
}

function InvoiceSheet({ bill, table, mono }: { bill: Bill; table: string; mono: boolean }) {
  const { business, order } = bill;
  const parcel = order.kind === 'Parcel';
  const tableName = bill.tableName ?? table;
  const { subtotal, saving, tax, total } = totals(order.items, bill.taxRate, order.discount);
  const advance = order.advance?.amount ?? 0;
  const tip = order.tip ?? 0;
  const payable = total + tip;
  const paid = sumPayments(bill.payments);
  const due = Math.max(0, payable - advance - paid);
  const mealOptions = order.session && !sessions.includes(order.session) ? [...sessions, order.session] : sessions;
  const amountRows = [
    ['Total', subtotal],
    ...(saving ? [['Discount', -saving]] as const : []),
    [`CGST ${bill.taxRate}%`, tax],
    [`SGST ${bill.taxRate}%`, tax],
    ['Grand total', total],
    ...(tip ? [['Voluntary tip', tip], ['Total with tip', payable]] as const : []),
    ['Advance', advance],
    ['Balance after advance', Math.max(0, payable - advance)],
    ['Paid at checkout', paid],
    ['Amount due', due],
  ] as const;

  return (
    <article className="sr-invoice-sheet" data-ink={mono ? 'mono' : 'colour'} aria-label={`Invoice ${bill.id}`}>
      <header className="sr-invoice-head">
        <div className="sr-invoice-stamp">
          <span><b>GSTIN</b> {business.gstin}</span>
          <span>Itemized bill no. <b>{bill.id}</b></span>
          <ul aria-label="Guest record">
            <Tick label="Blacklist" checked={order.blacklist === true} />
            <Tick label="No need to blacklist" checked={order.blacklist === false} />
          </ul>
        </div>
        <div className="sr-invoice-brand">
          <Mark name={business.name} />
          <p className="sr-invoice-script">Love in every bite…</p>
          <address>{business.address}</address>
        </div>
        <div className="sr-invoice-greeting">
          <span>{business.phone}</span>
          <Coffee size={31} strokeWidth={1.6} aria-hidden="true" />
          <span className="sr-invoice-script">bon appétit!</span>
        </div>
        <svg className="sr-invoice-flourish" viewBox="0 0 600 16" preserveAspectRatio="none" aria-hidden="true">
          <path fill="currentColor" d="M0 3c98 0 106 12 209 12h154C472 15 482 1 600 1v5C483 6 473 16 363 16H209C107 16 94 8 0 8Z" />
        </svg>
      </header>

      <div className="sr-invoice-visit">
        <dl className="sr-invoice-fields">
          <RuledField label="Dated">{[formatDate(bill.date), bill.time].filter(Boolean).join(' · ')}</RuledField>
          <RuledField label="Guest name">{order.guest}</RuledField>
          <RuledField label="Handphone no.">{order.guestPhone}</RuledField>
          <RuledField label="Name of host">{order.host}</RuledField>
          <RuledField label="Referred by">{order.referral}</RuledField>
          <div className="sr-invoice-field-pair">
            <RuledField label="Pet name">{order.pet}</RuledField>
            <RuledField label="Breed">{order.breed}</RuledField>
          </div>
          {!parcel && <div className="sr-invoice-field-pair">
            <RuledField label="No. of covers">{order.extraCovers == null ? order.covers : `${order.covers} + ${order.extraCovers}`}</RuledField>
            <RuledField label="Name of table">{tableName || 'Unassigned'}</RuledField>
          </div>}
          <div className="sr-invoice-field-pair">
            <RuledField label="Order type">{parcel ? `Parcel · ${order.source}` : `Dine-in · ${order.source}`}</RuledField>
            <RuledField label="Guest type">{order.guestType}</RuledField>
          </div>
          {parcel && tableName && <RuledField label="Name of table">{tableName}</RuledField>}
          <RuledField label="Nativity">{order.nativity}</RuledField>
          <RuledField label="Date & time of appointment">{order.source !== 'Walk-in' ? [formatDate(order.date), order.time].filter(Boolean).join(' · ') : ''}</RuledField>
          {parcel
            ? <RuledField label="Pickup time">{order.pickupTime?.replace('T', ' · ')}</RuledField>
            : <RuledField label="Happy time started at">{order.seatedAt}</RuledField>}
          <div className="sr-invoice-field-pair">
            <RuledField label="From">{order.hometown}</RuledField>
            <RuledField label="Place of stay at Yercaud">{order.stay}</RuledField>
          </div>
        </dl>
        <ul className="sr-invoice-meals" aria-label="Meal session">
          {mealOptions.map(session => <Tick key={session} label={session} checked={session === order.session} />)}
        </ul>
      </div>

      <table className="sr-invoice-items" aria-label="Itemized dishes">
        <colgroup><col /><col /><col /><col /><col /></colgroup>
        <thead><tr className="sr-invoice-print-ref"><th colSpan={5}>Sweet Rascal · Bill {bill.id}{bill.voided ? ' · Voided' : ''}</th></tr><tr>
          <th scope="col">No.</th><th scope="col">Dish savoured</th><th scope="col">Qty</th><th scope="col">Cost per dish</th><th scope="col">Amount</th>
        </tr></thead>
        <tbody>
          {order.items.map((item, index) => <tr key={`${item.id}-${index}`}>
            <td>{index + 1}</td><td>{item.name}{item.note && <small>{item.note}</small>}</td><td>{item.quantity}</td>
            <td>{money(item.price)}</td><td>{money(item.price * item.quantity)}</td>
          </tr>)}
          {order.items.length === 0 && <tr><td colSpan={5}>No dishes recorded</td></tr>}
        </tbody>
      </table>

      <div className="sr-invoice-settlement">
        <div className="sr-invoice-welcome">
          <p className="sr-invoice-script">{business.footer}</p>
          <p>Com. Dr. Vishoo Kaliapa · Signature Chef &amp; Recipe Creator</p>
          <ul aria-label="Recorded payments">
            {order.advance && <li>Advance · {order.advance.method} · {money(advance)}</li>}
            {bill.payments.map((payment, index) => <li key={index}>{payment.method} · {money(payment.amount)}</li>)}
          </ul>
          <strong className="sr-invoice-status">Sample{bill.voided ? ' · Voided' : due === 0 ? ' · Paid' : ''}</strong>
        </div>
        <dl className="sr-invoice-totals">
          {amountRows.map(([label, amount]) => (
            <div key={label} data-emphasis={label === 'Grand total' || label === 'Amount due' ? 'true' : undefined}>
              <dt>{label}</dt><dd>{money(amount)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <footer className="sr-invoice-footer">
        <Choices label="Party relationship" options={relationshipOptions} value={order.relationship} />
        <Choices label="Guest rating" options={ratingOptions} value={order.rating} />
      </footer>
    </article>
  );
}

function whatsappNumber(value: string) {
  const trimmed = value.trim();
  if (!/^(?:\+|00)?[\d\s().-]+$/.test(trimmed)) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
  if (trimmed.startsWith('00')) return whatsappNumber('+' + digits.slice(2));
  if (/^0?[6-9]\d{9}$/.test(digits)) return '91' + digits.slice(-10);
  return /^91[6-9]\d{9}$/.test(digits) ? digits : '';
}

function ShareInvoice({ bill, close, onShare }: Pick<BillPreviewProps, 'bill' | 'close' | 'onShare'>) {
  const [phone, setPhone] = useState(bill.order.guestPhone ?? '');
  const [opened, setOpened] = useState(false);
  const fieldId = useId();
  const number = whatsappNumber(phone);
  const message = `Hello, here is your bill ${bill.id} from ${bill.business.name}. Thank you for your order!`;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  return (
    <Dialog title="Share bill on WhatsApp" close={close}>
      <ol className="sr-invoice-share-steps">
        <li>Open the print dialog and choose <strong>Save as PDF</strong> or your device’s PDF export option.</li>
        <li>Open WhatsApp below. Attach the saved PDF to the prefilled message and send it.</li>
      </ol>
      <button type="button" className="btn secondary sr-invoice-print-pdf" onClick={() => window.print()}><Printer size={16} /> Print A4 / save PDF</button>
      <p className="sr-invoice-share-note">Review the PDF before sharing. It includes the guest information and legacy fields shown in the preview.</p>
      <div className="field">
        <label htmlFor={fieldId}>Customer WhatsApp number</label>
        <input id={fieldId} type="tel" autoComplete="tel" value={phone} placeholder="+91 98765 43210"
          aria-invalid={Boolean(phone.trim() && !number)} aria-describedby={fieldId + '-hint'}
          onChange={event => { setPhone(event.target.value); setOpened(false); }} />
        <small id={fieldId + '-hint'}>{phone.trim() && !number ? 'Enter a valid Indian mobile number or include the country code with +.' : 'Indian mobile numbers can be entered without +91.'}</small>
      </div>
      <p className="sr-invoice-message">{message}</p>
      <div className="dialog-actions">
        {number
          ? <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => {
            setOpened(true);
            onShare?.({ billId: bill.id, channel: 'WhatsApp', action: 'opened', at: new Date().toISOString() });
          }}>Open WhatsApp <ExternalLink size={16} /></a>
          : <button className="btn primary" type="button" disabled>Open WhatsApp <ExternalLink size={16} /></button>}
      </div>
      <p className="sr-invoice-share-note" role="status">{opened ? 'WhatsApp link opened. Attach the saved PDF in the chat, then send it.' : ''}</p>
    </Dialog>
  );
}

export function BillPreview({ bill, table, close, canVoid, onVoid, onShare, onDeparture }: BillPreviewProps) {
  const [mono, setMono] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="sr-invoice-preview">
      <div className="sr-invoice-controls">
        <Title title={`Bill ${bill.id}`} subtitle="Print or save as PDF in A4 portrait. Check that paper size is A4 in the print dialog." action={<>
          <button className="btn secondary" type="button" onClick={close}><ArrowLeft size={16} /> Bills</button>
          <div className="sr-invoice-modes" role="group" aria-label="Print colour">
            <button className="btn" type="button" aria-pressed={!mono} onClick={() => setMono(false)}>Colour</button>
            <button className="btn" type="button" aria-pressed={mono} onClick={() => setMono(true)}>Black &amp; white</button>
          </div>
          {!bill.voided && <button className="btn secondary" type="button" onClick={() => setShareOpen(true)}><MessageCircle size={16} /> WhatsApp</button>}
          <button className="btn primary" type="button" onClick={() => window.print()}><Printer size={16} /> Print A4</button>
        </>} />
      </div>
      {onDeparture && <div className="sr-invoice-controls panel bill-departure">
        <div><strong>{bill.order.kind === 'Parcel' ? 'Confirm pickup when collected' : 'Free the table when guests leave'}</strong><p>{bill.order.kind === 'Parcel' ? 'You can do this later from the Billing Desk.' : 'The table stays occupied until you confirm departure.'}</p></div>
        <button type="button" className="btn secondary" onClick={onDeparture}>{bill.order.kind === 'Parcel' ? 'Mark collected' : 'Confirm departure'}</button>
      </div>}
      <InvoiceSheet bill={bill} table={table} mono={mono} />
      {canVoid && !bill.voided && <div className="sr-invoice-controls sr-invoice-admin"><button className="btn secondary" type="button" onClick={onVoid}>Void sample bill</button></div>}
      {shareOpen && !bill.voided && <ShareInvoice bill={bill} close={() => setShareOpen(false)} onShare={onShare} />}
    </div>
  );
}
