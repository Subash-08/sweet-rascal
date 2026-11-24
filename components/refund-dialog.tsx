'use client';

import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { type Bill, type Method, type Refund, methods, parseMoney, payable, refundTotal, rupees, sumPayments } from '../lib/demo';
import { Dialog, Field } from './ui';

export function RefundDialog({ bill, refunds, close, save }: {
  bill: Bill; refunds: Refund[]; close: () => void;
  save: (input: { amount: number; method: Method; reason: string; cancelled: boolean; requestId?: string }) => string | void | Promise<string | void>;
}) {
  const paid = (bill.order.advance?.amount ?? 0) + sumPayments(bill.payments);
  const remaining = Math.max(0, Math.min(paid, payable(bill.order, bill.taxRate)) - refundTotal(refunds, bill.id));
  const [mode, setMode] = useState('Full refund');
  const [method, setMethod] = useState<Method>('UPI');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = useRef('');
  return <Dialog title="Refund / cancel bill" description={bill.id + ' · ' + (bill.order.guest || 'Guest')} close={close}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      const value = mode === 'Full refund' ? remaining : parseMoney(amount);
      if (!Number.isSafeInteger(value) || value <= 0 || value > remaining) { setError('Enter an amount up to ' + rupees(remaining, true) + '.'); return; }
      if (!reason.trim()) { setError('Add a short reason.'); return; }
      setSaving(true);
      requestId.current ||= crypto.randomUUID();
      const failure = await save({ amount: value, method, reason: reason.trim(), cancelled: cancelled && value === remaining, requestId: requestId.current });
      if (failure) { setError(failure); setSaving(false); }
    }}>
      <p className="refund-balance">Available to refund <strong>{rupees(remaining, true)}</strong></p>
      <div className="form-grid">
        <Field label="Refund"><select value={mode} onChange={event => { setMode(event.target.value); setCancelled(false); }}><option>Full refund</option><option>Partial refund</option></select></Field>
        <Field label="Refund method"><select value={method} onChange={event => setMethod(event.target.value as Method)}>{methods.map(value => <option key={value}>{value}</option>)}</select></Field>
        {mode === 'Partial refund' && <Field label="Refund amount (₹)"><input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></Field>}
        <Field label="Reason" wide><textarea required rows={2} maxLength={240} value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. Customer returned a dish…" /></Field>
      </div>
      {mode === 'Full refund' && <label className="check-field"><input type="checkbox" checked={cancelled} onChange={event => setCancelled(event.target.checked)} /> Cancel the entire bill after refund</label>}
      <p className="hint">Confirm after the money has been returned to the customer. The original bill and a linked refund record remain available.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="btn secondary" disabled={saving} onClick={close}>Go back</button>
        <button className="btn primary" disabled={saving || remaining === 0}><RotateCcw size={17} aria-hidden="true" /> Confirm refund{cancelled ? ' and cancellation' : ''}</button></div>
    </form>
  </Dialog>;
}
