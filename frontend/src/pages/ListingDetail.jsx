import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';
import { ReportSheet } from '../components/ReportButton.jsx';
import UserName from '../components/VerifiedBadge.jsx';
import { CONDITIONS, MARKET_CATEGORIES, formatPrice } from '../lib/market.js';
import { academicLine, firstName } from '../lib/profile.js';
import { timeAgo } from '../lib/time.js';
import { ListingCard } from './Marketplace.jsx';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const trackRef = useRef(null);

  useEffect(() => {
    setData(null);
    setSlide(0);
    api(`/listings/${id}`)
      .then(setData)
      .catch((err) => setError(err.status === 404 ? 'This item isn’t available any more.' : err.message));
  }, [id]);

  if (error) {
    return (
      <main className="mk-detail">
        <header className="mk-detail-bar">
          <button type="button" className="icon-button" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
        </header>
        <div className="sr-message">
          <strong>{error}</strong>
          <Link to="/market" className="btn btn-primary" style={{ alignSelf: 'center', marginTop: '0.75rem' }}>
            Back to Marketplace
          </Link>
        </div>
      </main>
    );
  }
  if (!data) return <div className="page-loading">Loading…</div>;

  const { listing, moreFromSeller } = data;
  const seller = listing.seller;

  async function messageSeller() {
    setBusy(true);
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId: seller.id, listingId: listing.id } });
      navigate(`/messages/${conversation.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function setStatus(status) {
    setBusy(true);
    try {
      const res = await api(`/listings/${listing.id}`, { method: 'PATCH', body: { status } });
      setData((d) => ({ ...d, listing: res.listing }));
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this listing?')) return;
    await api(`/listings/${listing.id}`, { method: 'DELETE' });
    navigate('/market?tab=mine', { replace: true });
  }

  function onScroll() {
    const el = trackRef.current;
    setSlide(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <main className="mk-detail">
      <header className="mk-detail-bar">
        <button type="button" className="icon-button" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <button type="button" className="icon-button" aria-label="More options" onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </header>

      <div className="mk-gallery">
        {listing.photos.length ? (
          <>
            <div className="mk-gallery-track" ref={trackRef} onScroll={onScroll}>
              {listing.photos.map((p, i) => (
                <img key={p} src={p} alt={i === 0 ? listing.title : ''} />
              ))}
            </div>
            {listing.photos.length > 1 && (
              <div className="mk-dots" aria-hidden="true">
                {listing.photos.map((p, i) => (
                  <span key={p} className={i === slide ? 'is-active' : undefined} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mk-gallery-empty">
            <Icon name="bag" size={56} />
          </div>
        )}
        {listing.status === 'sold' && <span className="mk-sold mk-sold-lg">Sold</span>}
      </div>

      <section className="mk-info">
        <p className="mk-price">{formatPrice(listing.price)}</p>
        <h1>{listing.title}</h1>
        <p className="mk-posted">
          Listed {timeAgo(listing.createdAt)}
          {listing.location && (
            <>
              {', '}
              <Icon name="pinMap" size={15} /> {listing.location}
            </>
          )}
        </p>

        <dl className="mk-facts">
          <div>
            <dt>Condition</dt>
            <dd>{CONDITIONS[listing.condition]}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{MARKET_CATEGORIES[listing.category]}</dd>
          </div>
        </dl>

        {listing.description && <p className="mk-description">{listing.description}</p>}

        {seller && (
          <Link to={`/people/${seller.id}`} className="mk-seller">
            <Avatar user={seller} size={48} />
            <span className="mk-seller-text">
              <strong>
                <UserName user={seller} size={15} />
              </strong>
              <span>{academicLine(seller) || 'UTG student'}</span>
            </span>
            <Icon name="forward" size={18} />
          </Link>
        )}
        <p className="mk-safety">Meet on campus in a public place, and check the item before you pay.</p>
      </section>

      {moreFromSeller.length > 0 && (
        <section className="mk-more">
          <h2>More from {seller ? firstName(seller.name) : 'this seller'}</h2>
          <div className="mk-grid">
            {moreFromSeller.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      <footer className="mk-action-bar">
        {listing.isMine ? (
          <>
            <Link to={`/market/${listing.id}/edit`} className="btn btn-ghost">
              Edit
            </Link>
            {listing.status === 'sold' ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('active')}>
                Mark as available
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('sold')}>
                Mark as sold
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={busy || listing.status !== 'active'} onClick={messageSeller}>
            <Icon name="chat" size={20} />
            {listing.status === 'active' ? 'Message seller' : 'This item has been sold'}
          </button>
        )}
      </footer>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={listing.title}>
        <div className="sheet-list">
          {listing.canManage ? (
            <>
              {listing.isMine && (
                <Link to={`/market/${listing.id}/edit`} className="sheet-row">
                  <span className="sheet-row-icon">
                    <Icon name="edit" size={20} />
                  </span>
                  <span className="sheet-row-text">
                    <strong>Edit listing</strong>
                  </span>
                </Link>
              )}
              <button type="button" className="sheet-row is-danger" onClick={remove}>
                <span className="sheet-row-icon">
                  <Icon name="close" size={20} />
                </span>
                <span className="sheet-row-text">
                  <strong>Delete listing</strong>
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sheet-row is-danger"
              onClick={() => {
                setMenuOpen(false);
                setReporting(true);
              }}
            >
              <span className="sheet-row-icon">
                <Icon name="flag" size={20} />
              </span>
              <span className="sheet-row-text">
                <strong>Report listing</strong>
                <span>Scams, banned items or misleading photos</span>
              </span>
            </button>
          )}
        </div>
      </Sheet>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} targetType="listing" targetId={listing.id} />
    </main>
  );
}
