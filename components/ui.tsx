'use client';

import { cloneElement, isValidElement, useId, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, Search, X, Inbox } from 'lucide-react';

export function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true">♡</span><span><strong>Sweet Rascal</strong><small>YERCAUD · RESTAURANT</small></span></span>;
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'green' | 'amber' | 'blue' | 'gray' | 'red' }) {
  return <span className={'badge ' + (tone ?? 'gray')}><i />{children}</span>;
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return <div className="empty"><Inbox size={24} /><strong>{title}</strong>{detail && <span>{detail}</span>}</div>;
}

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  return <div className={'field' + (wide ? ' wide' : '')}><label htmlFor={id}>{label}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}

export function Dialog({ title, description, close, children, large }: { title: string; description?: string; close: () => void; children: ReactNode; large?: boolean }) {
  return <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }} aria-label={title} className={large ? 'dialog large' : 'dialog'}>
    <div className="dialog-body"><div className="dialog-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>{children}</div>
  </dialog>;
}

export function Form({ children, onSave, close, label = 'Save', danger = false }: {
  children: ReactNode; onSave: (data: FormData) => string | void; close: () => void; label?: string; danger?: boolean;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(onSave(new FormData(event.currentTarget)) ?? '');
  }
  return <form onSubmit={submit}><div className="form-grid">{children}</div>{error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button className="btn secondary" type="button" onClick={close}>Cancel</button><button className={'btn ' + (danger ? 'danger' : 'primary')}>{label}</button></div></form>;
}

export function Title({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="title-actions">{action}</div>}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search"><Search size={17} aria-hidden="true" /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} /></label>;
}

export type Column<T> = { label: string; render: (row: T) => ReactNode; sort?: (row: T) => string | number; numeric?: boolean };
export function DataTable<T extends { id: string }>({ columns, rows, search, placeholder = 'Search records…', filters, empty = 'No records found', pageSize = 8, mobileCard }: {
  columns: Column<T>[]; rows: T[]; search?: (row: T) => string; placeholder?: string; filters?: ReactNode; empty?: string; pageSize?: number;
  mobileCard?: (row: T) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ index: number; direction: number }>();
  const [page, setPage] = useState(0);
  let results = rows.filter(row => !search || search(row).toLowerCase().includes(query.trim().toLowerCase()));
  const sortColumn = sort && columns[sort.index]?.sort;
  if (sort && sortColumn) {
    results = results.slice().sort((a, b) => {
      const left = sortColumn(a), right = sortColumn(b);
      return sort.direction * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right)));
    });
  }
  const maxPage = Math.max(0, Math.ceil(results.length / pageSize) - 1);
  const currentPage = Math.min(page, maxPage);
  const visibleRows = results.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <div className={'panel data-panel' + (mobileCard ? ' ticket-list' : '')}>
    {(search || filters) && <div className="table-tools">{search && <SearchInput value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder={placeholder} />}{filters}
      {columns.some(column => column.sort) && <select className="mobile-sort" aria-label="Sort records" value={sort ? sort.index + ':' + sort.direction : ''} onChange={event => {
        const [index, direction] = event.target.value.split(':').map(Number);
        setSort(event.target.value ? { index, direction } : undefined); setPage(0);
      }}><option value="">Sort records</option>{columns.flatMap((column, index) => column.sort ? [<option key={index + 'a'} value={index + ':1'}>{column.label} ↑</option>, <option key={index + 'd'} value={index + ':-1'}>{column.label} ↓</option>] : [])}</select>}
    </div>}
    {results.length === 0 ? <Empty title={empty} detail={query ? 'Try a different search.' : undefined} /> : <>
      <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column, index) => <th key={column.label} scope="col" className={column.numeric ? 'numeric' : ''}
        aria-sort={sort?.index === index ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}>
        {column.sort ? <button className="sort-button" onClick={() => { setSort({ index, direction: sort?.index === index ? -sort.direction : 1 }); setPage(0); }}>{column.label}<ArrowDownUp size={12} /></button> : column.label}</th>)}</tr></thead>
        <tbody>{visibleRows.map(row => <tr key={row.id}>{columns.map(column => <td key={column.label} data-label={column.label} className={column.numeric ? 'numeric' : ''}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
      {mobileCard && <ul className="mobile-tickets" aria-label="Tickets">{visibleRows.map(row => <li key={row.id}>{mobileCard(row)}</li>)}</ul>}
      {results.length > pageSize && <div className="table-foot"><span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, results.length)} of {results.length}</span><div className="row"><button className="icon-button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><button className="icon-button" aria-label="Next page" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div></div>}
    </>}
  </div>;
}

export const fieldValue = (data: FormData, field: string) => String(data.get(field) ?? '').trim();
