/** iOS-style segmented control for switching views within a screen. */
export default function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([v, text, badge]) => (
        <button
          key={v}
          type="button"
          role="tab"
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
