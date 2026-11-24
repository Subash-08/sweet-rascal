'use client';

import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Guest } from '../lib/demo';
import { workspaceRequest } from '../lib/workspace-client';

export function CustomerSearch({ guests, connected, selected, onSelect }: {
  guests: Guest[]; connected: boolean; selected?: { id: string; name: string }; onSelect: (guest?: Guest) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let activeRequest = true;
    setItems([]); setError(''); setActive(-1);
    const text = query.trim();
    if (text.length < 2) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = connected ? await workspaceRequest('customers?picker=1&q=' + encodeURIComponent(text)) :
          { items: guests.filter(guest => guest.name.toLowerCase().startsWith(text.toLowerCase()) || guest.phone.startsWith(text)).slice(0, 10) };
        if (activeRequest) setItems(result.items);
      } catch (error) {
        if (activeRequest) setError(error instanceof Error ? error.message : 'Search failed. Try again.');
      } finally { if (activeRequest) setLoading(false); }
    }, 250);
    return () => { activeRequest = false; clearTimeout(timer); };
  }, [query, connected, guests]);
  function choose(guest: Guest) {
    onSelect(guest); setOpen(false); setQuery('');
  }
  return <div className="field customer-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label htmlFor={id}>Find customer</label>
    {selected?.id && <div className="customer-selected"><span>{selected.name}</span><button type="button" className="icon-button" aria-label="Clear selected customer" onClick={() => onSelect()}><X size={16} /></button></div>}
    <div className="search"><Search size={17} aria-hidden="true" /><input id={id} name="customerSearch" role="combobox" autoComplete="off"
      aria-expanded={open} aria-controls={id + '-results'} aria-autocomplete="list" aria-activedescendant={open && items[active] ? id + '-option-' + active : undefined}
      value={query} placeholder="Search name or phone…" onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); event.stopPropagation(); }
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(index + 1, items.length - 1))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (items[active]) choose(items[active]); }
      }} /></div>
    {open && <div className="customer-results"><ul id={id + '-results'} role="listbox" aria-label="Matching customers">
      {items.map((guest, index) => <li key={guest.id} id={id + '-option-' + index} role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()}>
        <button type="button" onClick={() => choose(guest)}><strong>{guest.name}</strong><small>{guest.phone || 'No phone'}</small></button>
      </li>)}
    </ul><p className={error ? 'error' : 'hint'} role="status">{error || (query.trim().length < 2 ? 'Type at least 2 characters.' : loading ? 'Searching…' : items.length ? 'Choose a customer, or type more to narrow the search.' : 'No matches. Enter guest details below or add a customer.')}</p></div>}
  </div>;
}
