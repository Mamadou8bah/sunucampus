import { ROLE_LABELS, STATUS_LABELS } from '../../components/Badges.jsx';
import { COMMUNITY_STATUS_LABELS } from '../../lib/communities.js';

const ACTION_LABELS = {
  none: 'no further action',
  content_hidden: 'content hidden',
  content_removed: 'content removed',
  user_warned: 'author warned',
  user_suspended: 'user suspended',
  user_banned: 'user banned',
  community_archived: 'community archived',
};

const contentLabel = (s) => ({ visible: 'visible', hidden: 'hidden', removed: 'removed' })[s] ?? s;

/** Plain-language description of an audit log entry. */
export function describeAction(log) {
  const d = log.details ?? {};
  const why = d.reason ? ` (${d.reason})` : '';
  switch (log.action) {
    case 'user.role_changed':
      return `changed a user's role from ${ROLE_LABELS[d.from]} to ${ROLE_LABELS[d.to]}`;
    case 'user.status_changed':
      return `changed a user's status from ${STATUS_LABELS[d.from]} to ${STATUS_LABELS[d.to]}${why}`;
    case 'user.warned':
      return `warned a user${d.message ? `: “${d.message.length > 90 ? `${d.message.slice(0, 90)}…` : d.message}”` : ''}`;
    case 'post.status_changed':
      return `marked a post as ${contentLabel(d.to)}${why}`;
    case 'comment.status_changed':
      return `marked a comment as ${contentLabel(d.to)}${why}`;
    case 'listing.status_changed':
      return `marked the listing ${d.name ? `“${d.name}”` : ''} as ${contentLabel(d.to)}${why}`;
    case 'community.status_changed':
      return `set ${d.name ? `“${d.name}”` : 'a community'} to ${COMMUNITY_STATUS_LABELS[d.to]?.toLowerCase() ?? d.to}${why}`;
    case 'report.resolved':
      return `resolved a report on a ${d.targetType}: ${ACTION_LABELS[d.action] ?? d.action}`;
    case 'report.dismissed':
      return `dismissed a report on a ${d.targetType}`;
    case 'report.exported':
      return `exported the ${d.section} usage report`;
    default:
      return log.action;
  }
}

export { ACTION_LABELS };
