/** Blue tick for verified UTG students. */
export function VerifiedBadge({ size = 18 }) {
  return (
    <svg className="verified-badge" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified UTG student">
      <title>Verified UTG student</title>
      <path
        fill="currentColor"
        d="M12 1.6l2.5 1.9 3.1-.2 1 3 2.6 1.8-.9 3 .9 3-2.6 1.8-1 3-3.1-.2L12 22.4l-2.5-1.9-3.1.2-1-3-2.6-1.8.9-3-.9-3 2.6-1.8 1-3 3.1.2z"
      />
      <path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A student's name with the blue tick when verified. */
export default function UserName({ user, size }) {
  return (
    <span className="user-name">
      <span className="user-name-text">{user.name}</span>
      {user.isVerified && <VerifiedBadge size={size} />}
    </span>
  );
}
