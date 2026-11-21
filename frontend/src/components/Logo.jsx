/** The SunuCampus mark with the wordmark. `tone="light"` is for dark backgrounds. */
export default function Logo({ size = 32, tone = 'dark', wordmark = true }) {
  return (
    <span className={`logo logo-${tone}`} style={{ '--logo-size': `${size}px` }}>
      <img src="/brand/sunucampus-mark.png" alt="" width={size} height={size} className="logo-mark" />
      {wordmark && (
        <span className="logo-word">
          Sunu<span>Campus</span>
        </span>
      )}
    </span>
  );
}
