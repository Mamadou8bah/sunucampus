const ROLE_LABELS = { student: 'Student', moderator: 'Moderator', admin: 'Admin' };
const STATUS_LABELS = { active: 'Active', suspended: 'Suspended', banned: 'Banned' };

export const RoleBadge = ({ role }) => <span className={`badge badge-role-${role}`}>{ROLE_LABELS[role] ?? role}</span>;

export const StatusBadge = ({ status }) => (
  <span className={`badge badge-status-${status}`}>{STATUS_LABELS[status] ?? status}</span>
);

export { ROLE_LABELS, STATUS_LABELS };
