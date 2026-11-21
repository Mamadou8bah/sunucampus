import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

const MAX_MB = 3;

/** Large avatar with add / change / remove. Uses the phone's photo library or camera. */
export default function PhotoPicker({ size = 132 }) {
  const { user, uploadPhoto, removePhoto } = useAuth();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Choose a photo under ${MAX_MB} MB`);
      return;
    }
    setError('');
    const url = URL.createObjectURL(file);
    setPreview(url);
    setBusy(true);
    try {
      await uploadPhoto(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPreview(null);
      URL.revokeObjectURL(url);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await removePhoto();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ? { ...user, avatarUrl: preview } : user;

  return (
    <div className="photo-picker">
      <button type="button" className="photo-picker-avatar" onClick={() => inputRef.current.click()} disabled={busy} aria-label={user.avatarUrl ? 'Change photo' : 'Add photo'}>
        <Avatar user={shown} size={size} />
        <span className="photo-picker-badge" aria-hidden="true">
          <Icon name={user.avatarUrl ? 'edit' : 'plus'} size={20} strokeWidth={2.2} />
        </span>
        {busy && <span className="photo-picker-busy">Uploading…</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} hidden />
      <div className="photo-picker-actions">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => inputRef.current.click()} disabled={busy}>
          {user.avatarUrl ? 'Change photo' : 'Add a photo'}
        </button>
        {user.avatarUrl && (
          <button type="button" className="link-button link-danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
