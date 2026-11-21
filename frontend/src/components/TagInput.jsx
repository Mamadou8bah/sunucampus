import { useId, useState } from 'react';

const normalise = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Free-text tag picker with tappable suggestions. Enter or comma adds a tag. */
export default function TagInput({ label, value, onChange, suggestions = [], max = 15, hint, error }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const full = value.length >= max;

  function add(raw) {
    const tag = normalise(raw).slice(0, 30);
    if (tag && !value.includes(tag) && !full) onChange([...value, tag]);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const available = (suggestions ?? []).filter((s) => !value.includes(s.toLowerCase())).slice(0, 10);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {value.length > 0 && (
        <ul className="chips tag-input-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {value.map((tag) => (
            <li key={tag} className="chip chip-goal">
              {tag}
              <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        disabled={full}
        enterKeyHint="done"
        placeholder={full ? `You can add up to ${max}` : 'Type and press Enter'}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
        onKeyDown={handleKeyDown}
        onBlur={() => draft && add(draft)}
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        aria-invalid={Boolean(error)}
      />
      {available.length > 0 && !full && (
        <div className="suggestions">
          {available.map((s) => (
            <button key={s} type="button" className="chip-button" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
      {(hint || error) && (
        <p id={`${id}-hint`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
