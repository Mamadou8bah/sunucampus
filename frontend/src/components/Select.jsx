import { useEffect, useId, useRef, useState } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import Icon from './Icon.jsx';
import Sheet from './Sheet.jsx';

/**
 * Custom picker replacing the browser's <select>.
 * Phones: a bottom sheet of options. Wider screens: a dropdown menu.
 *
 * options: [[value, label], ...] or [{ value, label }, ...]
 * onChange receives the chosen value (a string).
 */
export default function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Choose',
  label,
  variant = 'field', // field | pill | quiet
  disabled = false,
  invalid = false,
  className = '',
}) {
  const items = options.map((o) => (Array.isArray(o) ? { value: String(o[0]), label: o[1] } : { value: String(o.value), label: o.label }));
  const current = items.find((o) => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery('(min-width: 700px)');
  const autoId = useId();
  const buttonId = id ?? `sel-${autoId}`;
  const listId = `${buttonId}-list`;
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);

  function choose(v) {
    setOpen(false);
    if (v !== String(value ?? '')) onChange(v);
    buttonRef.current?.focus();
  }

  // Dropdown: close on outside click; move focus to the selected option when opened.
  useEffect(() => {
    if (!open || !desktop) return undefined;
    const onDown = (e) => !wrapRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    const selected = listRef.current?.querySelector('[aria-selected="true"]') ?? listRef.current?.querySelector('[role="option"]');
    selected?.focus();
    selected?.scrollIntoView?.({ block: 'nearest' });
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, desktop]);

  function onListKey(e) {
    const opts = [...listRef.current.querySelectorAll('[role="option"]')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[Math.min(opts.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[Math.max(0, i - 1)]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      opts[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      opts[opts.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  function onButtonKey(e) {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  }

  const optionList = (
    <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={desktop ? 'sel-menu' : 'sel-sheet-list'} onKeyDown={onListKey}>
      {items.map((o) => {
        const selected = o.value === String(value ?? '');
        return (
          <li key={o.value || '__empty'}>
            <button type="button" role="option" aria-selected={selected} className={`sel-option ${selected ? 'is-selected' : ''}`} onClick={() => choose(o.value)}>
              <span>{o.label}</span>
              {selected && <Icon name="check" size={18} strokeWidth={2.4} />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={wrapRef} className={`sel sel-${variant} ${open ? 'is-open' : ''} ${className}`}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={`sel-button ${invalid ? 'is-invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label ? `${label}: ${current?.label ?? placeholder}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
      >
        <span className={`sel-value ${current ? '' : 'is-placeholder'}`}>{current?.label ?? placeholder}</span>
        <Icon name="chevronDown" size={18} className="sel-chevron" />
      </button>

      {desktop
        ? open && optionList
        : (
          <Sheet open={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
            {optionList}
          </Sheet>
        )}
    </div>
  );
}
