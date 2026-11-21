// Single source of truth for roles and account statuses (see docs/PROPOSAL.md §4.2).
export const ROLES = Object.freeze({
  STUDENT: 'student',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
});

export const ROLE_LIST = Object.values(ROLES);

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
});

export const STATUS_LIST = Object.values(ACCOUNT_STATUS);

// Conversation-starter prompts shown on profiles (up to three per student).
export const PROFILE_PROMPTS = Object.freeze([
  'We’ll get along if…',
  'I’m on SunuCampus to…',
  'Ask me about…',
  'My ideal study session…',
  'A project I’d love to build…',
  'After class you’ll find me…',
  'I can help you with…',
]);

export const CONNECTION_GOALS = Object.freeze([
  'friendship',
  'study_partner',
  'networking',
  'project_collaboration',
  'mentorship',
]);
