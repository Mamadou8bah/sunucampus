/** iOS-style segmented control for switching views within a screen. */
export default function Segmented({ options, value, onChange, label, panelId }) {
  function moveFocus(event) {
    const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    const last = tabs.length - 1;
    const next = {
      ArrowLeft: current === 0 ? last : current - 1,
      ArrowRight: current === last ? 0 : current + 1,
      Home: 0,
      End: last,
    }[event.key];
    if (typeof next !== 'number') return;
    event.preventDefault();
    tabs[next].focus();
  }

  return (
    <div className="segmented" role="tablist" aria-label={label} onKeyDown={panelId ? moveFocus : undefined}>
      {options.map(([v, text, badge]) => (
        <button
          key={v}
          type="button"
          role="tab"
          id={panelId ? `${panelId}-${v}` : undefined}
          aria-controls={panelId}
          tabIndex={panelId ? (value === v ? 0 : -1) : undefined}
          aria-selected={value === v}
          className={value === v ? 'is-active' : undefined}
          onClick={() => onChange(v)}
        >
          {text}
          {badge > 0 && <span className="segmented-badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
