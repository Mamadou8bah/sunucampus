import { useState } from 'react';
import { initials } from '../lib/profile.js';

// Each person without a photo gets a consistent colour from their name.
const TONES = [
  ['#fde8f2', '#9e1660'],
  ['#fde8f4', '#a3216f'],
  ['#e6f2ee', '#1f6b52'],
  ['#e6effd', '#2b5aa8'],
  ['#fbe9ef', '#9d2550'],
  ['#fff0e6', '#9a4a12'],
];
const toneFor = (name = '') => TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length];

export default function Avatar({ user, size = 48 }) {
  // Remember which URL failed, so a new photo gets a fresh chance to load.
  const [failedUrl, setFailedUrl] = useState(null);
  const failed = failedUrl === user.avatarUrl;
  const style = { width: size, height: size, fontSize: size * 0.36 };

  if (user.avatarUrl && !failed) {
    return <img className="avatar" src={user.avatarUrl} alt="" style={style} loading="lazy" decoding="async" onError={() => setFailedUrl(user.avatarUrl)} />;
  }
  const [bg, fg] = toneFor(user.name);
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: bg, color: fg }} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}
