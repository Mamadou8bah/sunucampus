import { ROLES } from '../config/roles.js';
import { COMMUNITY_STATUS } from '../models/Community.js';

export const isAdmin = (user) => user.role === ROLES.ADMIN;

/** Admins moderate everything; community moderators moderate their own community. */
export const canModerateCommunity = (user, community) =>
  Boolean(user && (isAdmin(user) || (community && community.isModerator(user._id))));

/** Pending and rejected communities are only visible to their creator, their moderators and admins. */
export const canViewCommunity = (user, community) =>
  [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.ARCHIVED].includes(community.status) ||
  community.creator.equals(user._id) ||
  canModerateCommunity(user, community);

export const canPostInCommunity = (user, community) =>
  community.status === COMMUNITY_STATUS.ACTIVE && community.isMember(user._id);
