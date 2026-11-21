export const GOAL_LABELS = {
  friendship: 'Friendship',
  study_partner: 'Study partner',
  networking: 'Networking',
  project_collaboration: 'Project collaboration',
  mentorship: 'Mentorship',
};

export const GOAL_HINTS = {
  friendship: 'Meet people beyond your class',
  study_partner: 'Revise, quiz and keep each other on track',
  networking: 'Build contacts for your career',
  project_collaboration: 'Find teammates with the skills you need',
  mentorship: 'Learn from seniors, or guide newer students',
};

export const YEARS = [1, 2, 3, 4, 5, 6, 7];

/** "Computer Science, year 2", skipping whatever is missing. */
export function academicLine(user) {
  if (user.programme && user.yearOfStudy) return `${user.programme}, year ${user.yearOfStudy}`;
  if (user.programme) return user.programme;
  if (user.yearOfStudy) return `Year ${user.yearOfStudy}`;
  return '';
}

export const isProfileComplete = (user) =>
  Boolean(user.programme && user.goals?.length && (user.interests?.length || user.skills?.length));

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export const firstName = (name = '') => name.split(' ')[0];
