import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import Segmented from '../components/Segmented.jsx';
import { MARKET_CATEGORIES, formatPrice } from '../lib/market.js';
import { timeAgo } from '../lib/time.js';
import Select from '../components/Select.jsx';

export function ListingCard({ listing }) {
  return (
    <Link to={`/market/${listing.id}`} className="mk-card">
      <span className="mk-card-photo">
        {listing.photos[0] ? <img src={listing.photos[0]} alt="" loading="lazy" /> : <Icon name="bag" size={34} />}
        {listing.status === 'sold' && <span className="mk-sold">Sold</span>}
      </span>
      <span className="mk-card-price">{formatPrice(listing.price)}</span>
      <span className="mk-card-title">{listing.title}</span>
      <span className="mk-card-meta">
        {listing.location || MARKET_CATEGORIES[listing.category]}, {timeAgo(listing.createdAt)}
      </span>
    </Link>
  );
}

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'browse';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const set = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) set({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = params.toString();
  useEffect(() => {
    setData(null);
    setError('');
    const q = Object.fromEntries(new URLSearchParams(query));
    delete q.tab;
    api('/listings', { query: { ...q, ...(tab === 'mine' && { mine: 'true' }), limit: 40 } })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [query, tab]);

  return (
    <main className="mk">
      <header className="mk-bar">
        <h1>Marketplace</h1>
        <Link to="/market/new" className="mk-sell">
          <Icon name="plus" size={18} strokeWidth={2.4} /> Sell
        </Link>
      </header>

      <div className="mk-controls">
        <Segmented
          label="Marketplace view"
          value={tab}
          onChange={(v) => set({ tab: v === 'mine' ? 'mine' : '' })}
          options={[
            ['browse', 'Browse'],
            ['mine', 'Your listings'],
          ]}
        />
        {tab === 'browse' && (
          <>
            <div className="mk-search" role="search">
              <Icon name="search" size={18} />
              <input type="search" placeholder="Search books, phones, fans…" aria-label="Search the marketplace" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="filter-row" aria-label="Categories">
              <button type="button" className={`filter-chip ${!category ? 'is-on' : ''}`} onClick={() => set({ category: '' })}>
                All
              </button>
              {Object.entries(MARKET_CATEGORIES).map(([v, l]) => (
                <button key={v} type="button" className={`filter-chip ${category === v ? 'is-on' : ''}`} onClick={() => set({ category: category === v ? '' : v })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mk-sort">
              <label htmlFor="mk-sort">Sort</label>
              <Select
                id="mk-sort"
                label="Sort"
                variant="pill"
                value={sort}
                onChange={(v) => set({ sort: v === 'newest' ? '' : v })}
                options={[
                  ['newest', 'Newest first'],
                  ['price_asc', 'Price: low to high'],
                  ['price_desc', 'Price: high to low'],
                ]}
              />
            </div>
          </>
        )}
      </div>

      {error && <p className="sr-message">{error}</p>}
      {!data && !error && <p className="sr-message">Loading…</p>}
      {data && data.listings.length === 0 && (
        <div className="sr-message">
          <strong>{tab === 'mine' ? 'You haven’t listed anything yet' : 'Nothing here yet'}</strong>
          <span>{tab === 'mine' ? 'Sell books, gadgets or anything you no longer need.' : 'Try another category, or be the first to sell something.'}</span>
          <Link to="/market/new" className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '0.75rem' }}>
            List an item
          </Link>
        </div>
      )}
      {data?.listings.length > 0 && (
        <div className="mk-grid">
          {data.listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </main>
  );
}
