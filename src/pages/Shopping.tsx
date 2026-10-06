import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Plus, Trash2, Users } from 'lucide-react';
import { useT } from '../i18n';
import { useToast } from '../components/Toast';
import { EmptyState, PageHeader, cx } from '../components/ui';
import { SHOPPING_LISTS, guessShoppingListName } from '../lib/shopping';
import type { ParsedShoppingItem } from '../lib/parser';
import { useData, useStore } from '../store/DataProvider';
import type { ShoppingItem } from '../types';

function Row({ item }: { item: ShoppingItem }) {
  const store = useStore();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  return (
    <li className={cx('group flex items-center gap-1 rounded-xl hover:bg-paper', leaving && 'animate-leave')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.purchased}
        onClick={() => store.toggleShopping(item.id)}
        className="flex min-h-12 flex-1 items-center gap-3 rounded-xl px-2 text-left"
      >
        <span
          className={cx(
            'grid size-6 shrink-0 place-items-center rounded-lg border-2 transition',
            item.purchased ? 'border-brand-600 bg-brand-600' : 'border-line-strong group-hover:border-brand-500',
          )}
          aria-hidden="true"
        >
          <Check className={cx('size-4 text-white transition', item.purchased ? 'scale-100' : 'scale-0')} strokeWidth={3} />
        </span>
        <span className={cx('flex-1 font-medium transition', item.purchased && 'text-muted line-through decoration-ink/30')}>{item.name}</span>
        {item.quantity && <span className="rounded-md bg-ink/5 px-2 py-0.5 text-sm text-muted">{item.quantity}</span>}
      </button>
      <button
        type="button"
        className="icon-btn text-muted opacity-100 hover:text-attn sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        aria-label={`Delete ${item.name}`}
        onClick={() => {
          setLeaving(true);
          window.setTimeout(async () => {
            const removed = await store.deleteShopping([item.id]);
            toast.success(`Removed ${item.name}`, { label: 'Undo', onClick: () => void store.restoreShopping(removed) });
          }, 250);
        }}
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export default function Shopping() {
  const data = useData();
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const location = useLocation();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [list, setList] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const prefill = (location.state as { prefill?: ParsedShoppingItem[] } | null)?.prefill;

  useEffect(() => {
    if (prefill?.length) {
      setName(prefill.map((p) => p.name).join(', '));
      setList(prefill[0].listCategory);
    }
  }, [prefill]);

  const items = data.shopping;
  const purchased = items.filter((i) => i.purchased);
  const lists = [...new Set([...SHOPPING_LISTS, ...items.map((i) => i.listCategory)])]
    .map((l) => ({ name: l, items: items.filter((i) => i.listCategory === l).sort((a, b) => Number(a.purchased) - Number(b.purchased) || a.createdAt.localeCompare(b.createdAt)) }))
    .filter((l) => l.items.length);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const names = name.split(',').map((n) => n.trim()).filter(Boolean);
    if (!names.length) {
      setError('What do you need to buy?');
      inputRef.current?.focus();
      return;
    }
    setError('');
    try {
      await store.addShoppingItems(names.map((n) => ({ name: n, quantity: names.length === 1 ? qty : undefined, listCategory: list || guessShoppingListName(n) })));
      setName('');
      setQty('');
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Shopping"
        subtitle={
          <>
            {items.length ? `${items.length - purchased.length} to buy · ${purchased.length} in the cart` : 'Everything you need to pick up.'}
            {store.family && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                <Users className="size-3.5" aria-hidden="true" /> {t('fam.sharedList', { name: store.family.name })}
              </span>
            )}
          </>
        }
        action={
          purchased.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const removed = await store.clearPurchased();
                toast.success(`Cleared ${removed.length} item${removed.length === 1 ? '' : 's'}`, { label: 'Undo', onClick: () => void store.restoreShopping(removed) });
              }}
            >
              Clear completed
            </button>
          )
        }
      />

      <form onSubmit={add} className="card mb-5 p-3 sm:p-4" noValidate>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="shop-name">
            Item
          </label>
          <input
            id="shop-name"
            ref={inputRef}
            className="input flex-1"
            placeholder="Add item (or several, separated by commas)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'shop-error' : undefined}
            enterKeyHint="done"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="shop-qty">
              Quantity
            </label>
            <input id="shop-qty" className="input w-24" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} maxLength={30} />
            <label className="sr-only" htmlFor="shop-list">
              List
            </label>
            <select id="shop-list" className="input w-36" value={list} onChange={(e) => setList(e.target.value)}>
              <option value="">Auto list</option>
              {SHOPPING_LISTS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary shrink-0" aria-label="Add item">
              <Plus className="size-5" />
            </button>
          </div>
        </div>
        {error && (
          <p id="shop-error" role="alert" className="mt-2 text-sm font-medium text-attn">
            {error}
          </p>
        )}
      </form>

      {lists.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🧺" title="Your shopping list is empty." body="Add milk, bulbs, batteries… anything you need to pick up." />
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((l) => (
            <section key={l.name} className="card animate-fade-up p-4" aria-label={l.name}>
              <h2 className="section-title mb-1">
                {l.name}
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">{l.items.filter((i) => !i.purchased).length}</span>
              </h2>
              <ul className="-mx-1">
                {l.items.map((i) => (
                  <Row key={i.id} item={i} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
