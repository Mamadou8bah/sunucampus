import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, apiUpload } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import { CONDITIONS, MARKET_CATEGORIES, PICKUP_SUGGESTIONS } from '../lib/market.js';
import Select from '../components/Select.jsx';

const MAX_PHOTOS = 4;

/** Sell a new item (/market/new) or edit one (/market/:id/edit). */
export default function ListingForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [form, setForm] = useState({ title: '', price: '', category: '', condition: 'good', location: '', description: '' });
  const [existing, setExisting] = useState([]); // URLs already saved
  const [added, setAdded] = useState([]); // { file, preview }
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!editing) return;
    api(`/listings/${id}`)
      .then(({ listing }) => {
        setForm({
          title: listing.title,
          price: String(listing.price),
          category: listing.category,
          condition: listing.condition,
          location: listing.location ?? '',
          description: listing.description ?? '',
        });
        setExisting(listing.photos);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  // Free preview URLs when photos are removed or the page closes.
  useEffect(() => () => added.forEach((a) => URL.revokeObjectURL(a.preview)), [added]);

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const total = existing.length + added.length;

  function onFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const room = MAX_PHOTOS - total;
    const tooBig = files.find((f) => f.size > 3 * 1024 * 1024);
    if (tooBig) setError('Each photo must be under 3 MB');
    setAdded((a) => [...a, ...files.filter((f) => f.size <= 3 * 1024 * 1024).slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});
    const body = new FormData();
    for (const [k, v] of Object.entries(form)) if (v !== '') body.append(k, v);
    if (editing) body.append('keepPhotos', JSON.stringify(existing));
    for (const a of added) body.append('photos', a.file);
    try {
      const { listing } = await apiUpload(editing ? `/listings/${id}` : '/listings', null, { method: editing ? 'PATCH' : 'POST', formData: body });
      navigate(`/market/${listing.id}`, { replace: true });
    } catch (err) {
      const byField = err.fieldErrors?.() ?? {};
      setFieldErrors(byField);
      setError(Object.keys(byField).length ? 'Check the highlighted fields.' : err.message);
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <main className="ef mk-form">
      <header className="ef-bar">
        <button type="button" className="ef-bar-btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <h1>{editing ? 'Edit listing' : 'Sell an item'}</h1>
        <button type="submit" form="listing-form" className="ef-bar-btn is-primary" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save' : 'Post'}
        </button>
      </header>

      <form id="listing-form" onSubmit={submit} noValidate>
        {error && (
          <p className="ef-error" role="alert">
            {error}
          </p>
        )}

        <div className="mk-photos">
          {existing.map((url) => (
            <span key={url} className="mk-photo">
              <img src={url} alt="" />
              <button type="button" aria-label="Remove photo" onClick={() => setExisting((list) => list.filter((u) => u !== url))}>
                <Icon name="close" size={14} strokeWidth={2.6} />
              </button>
            </span>
          ))}
          {added.map((a) => (
            <span key={a.preview} className="mk-photo">
              <img src={a.preview} alt="" />
              <button type="button" aria-label="Remove photo" onClick={() => setAdded((list) => list.filter((x) => x !== a))}>
                <Icon name="close" size={14} strokeWidth={2.6} />
              </button>
            </span>
          ))}
          {total < MAX_PHOTOS && (
            <button type="button" className="mk-photo-add" onClick={() => inputRef.current.click()}>
              <Icon name="camera" size={26} />
              <span>{total === 0 ? 'Add photos' : 'Add'}</span>
              <small>
                {total}/{MAX_PHOTOS}
              </small>
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
        </div>

        <div className="ef-group">
          <div className={`ef-row ${fieldErrors.title ? 'has-error' : ''}`}>
            <label htmlFor="mk-title">Title</label>
            <div className="ef-row-input">
              <input id="mk-title" name="title" maxLength={80} placeholder="What are you selling?" value={form.title} onChange={set} />
              {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
            </div>
          </div>
          <div className={`ef-row ${fieldErrors.price ? 'has-error' : ''}`}>
            <label htmlFor="mk-price">Price (D)</label>
            <div className="ef-row-input">
              <input id="mk-price" name="price" inputMode="numeric" placeholder="0 for free" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} />
              {fieldErrors.price && <p className="field-error">{fieldErrors.price}</p>}
            </div>
          </div>
          <div className={`ef-row ${fieldErrors.category ? 'has-error' : ''}`}>
            <label htmlFor="mk-category">Category</label>
            <div className="ef-row-input">
              <Select
                id="mk-category"
                label="Category"
                variant="quiet"
                value={form.category}
                invalid={Boolean(fieldErrors.category)}
                onChange={(v) => setForm({ ...form, category: v })}
                options={Object.entries(MARKET_CATEGORIES)}
              />
              {fieldErrors.category && <p className="field-error">Choose a category</p>}
            </div>
          </div>
          <div className="ef-row">
            <label htmlFor="mk-condition">Condition</label>
            <div className="ef-row-input">
              <Select id="mk-condition" label="Condition" variant="quiet" value={form.condition} onChange={(v) => setForm({ ...form, condition: v })} options={Object.entries(CONDITIONS)} />
            </div>
          </div>
          <div className="ef-row">
            <label htmlFor="mk-location">Pickup</label>
            <div className="ef-row-input">
              <input id="mk-location" name="location" list="mk-locations" maxLength={80} placeholder="e.g. Kanifing campus" value={form.location} onChange={set} />
              <datalist id="mk-locations">
                {PICKUP_SUGGESTIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="ef-row">
            <label htmlFor="mk-description">Details</label>
            <div className="ef-row-input">
              <textarea id="mk-description" name="description" rows={3} maxLength={1500} placeholder="Size, model, why you’re selling…" value={form.description} onChange={set} />
            </div>
          </div>
        </div>
        <p className="mk-form-note">Your listing shows your name and programme. Buyers message you inside SunuCampus.</p>
      </form>
    </main>
  );
}
