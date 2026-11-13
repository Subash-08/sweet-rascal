import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export function TicketCard({ reference, guest, context, status, amount, action, onOpen, actionLabel, secondaryAction }: {
  reference: string; guest: string; context?: string; status: ReactNode;
  amount?: ReactNode; action?: string; onOpen?: () => void; actionLabel?: string; secondaryAction?: ReactNode;
}) {
  return <article className="ticket-card">
    <div className="ticket-card-heading"><span>{reference}</span><div>{status}</div></div>
    <strong className="ticket-guest">{guest}</strong>
    {context && <p>{context}</p>}
    {(amount || onOpen) && <div className="ticket-card-footer">
      <div>{amount}</div>
      {onOpen && <button className="btn secondary compact" onClick={onOpen} aria-label={actionLabel ?? (action + ' ' + reference)}>{action}<ArrowRight size={15} /></button>}
    </div>}
    {secondaryAction}
  </article>;
}
