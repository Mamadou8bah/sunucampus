import { useEffect, useId, useRef, useState } from 'react';

/*
 * Small, dependency-free charts for the reporting module.
 * Colors come from CSS variables (--series-1, --series-2) validated for colour-vision deficiency.
 * Every chart has a table view so no value depends on reading the chart.
 */

const nf = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export const formatNumber = (n) => (Math.abs(n) >= 10_000 ? compact.format(n) : nf.format(n));

const formatBucket = (iso, interval) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const opts = interval === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
  return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
};

/** Clean axis ticks: 0, then multiples of 1, 2 or 5 × 10^n. */
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export function ChartCard({ title, subtitle, children, table, actions }) {
  return (
    <section className="chart-card card">
      <header className="chart-card-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
      {table && (
        <details className="chart-table">
          <summary>View as table</summary>
          {table}
        </details>
      )}
    </section>
  );
}

export function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={i > 0 ? 'num' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              {r.map((v, j) => (
                // eslint-disable-next-line react/no-array-index-key
                <td key={j} className={j > 0 ? 'num' : undefined}>
                  {typeof v === 'number' ? nf.format(v) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatTile({ label, value, hint, suffix = '' }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {typeof value === 'number' ? formatNumber(value) : value}
        {suffix && <span className="stat-suffix">{suffix}</span>}
      </p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  );
}

/**
 * Line chart over time buckets. `series` = [{ key, label }], data = [{ date, [key]: number }].
 * One or two series; hovering shows a crosshair with every value at that date.
 */
export function LineChart({ data, series, interval, height = 220 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const clipId = useId();
  const pad = { top: 12, right: 16, bottom: 28, left: 44 };
  const innerW = Math.max(width - pad.left - pad.right, 50);
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i) => (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => innerH - (v / top) * innerH;

  // Show at most ~6 date labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 90))));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = Math.round((px / innerW) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  const point = hover !== null ? data[hover] : null;

  return (
    <div className="line-chart" ref={ref}>
      {series.length > 1 && (
        <ul className="legend" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.key}>
              <span className={`legend-key legend-key-${i + 1}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${series.map((s) => s.label).join(' and ')} over time`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={-4} width={innerW} height={innerH + 8} />
          </clipPath>
        </defs>
        <g transform={`translate(${pad.left},${pad.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={0} x2={innerW} y1={y(t)} y2={y(t)} />
              <text className="axis-text" x={-8} y={y(t)} dy="0.32em" textAnchor="end">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.date} className="axis-text" x={x(i)} y={innerH + 18} textAnchor="middle">
                {formatBucket(d.date, interval)}
              </text>
            ) : null,
          )}

          <g clipPath={`url(#${clipId})`}>
            {series.map((s, si) => {
              const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[s.key])}`).join('');
              const area = `${path}L${x(data.length - 1)},${innerH}L${x(0)},${innerH}Z`;
              return (
                <g key={s.key}>
                  {series.length === 1 && <path d={area} className="series-area series-fill-1" />}
                  <path d={path} className={`series-line series-stroke-${si + 1}`} />
                </g>
              );
            })}
          </g>

          {point && (
            <g>
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} />
              {series.map((s, si) => (
                <circle key={s.key} className={`series-dot series-fill-solid-${si + 1}`} cx={x(hover)} cy={y(point[s.key])} r={4.5} />
              ))}
            </g>
          )}
        </g>
      </svg>
      {point && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(pad.left + x(hover) + 12, width - 170), top: pad.top }}
          role="status"
        >
          <p className="chart-tooltip-title">{formatBucket(point.date, interval)}</p>
          {series.map((s, si) => (
            <p key={s.key} className="chart-tooltip-row">
              <span className={`legend-key legend-key-${si + 1}`} aria-hidden="true" />
              <span>{s.label}</span>
              <strong>{nf.format(point[s.key])}</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a ranked breakdown, labelled with the value at the tip. */
export function BarList({ items, empty = 'No data in this range.' }) {
  if (!items.length || items.every((i) => !i.value)) return <p className="muted chart-empty">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${nf.format(item.value)}`}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">{nf.format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
