/**
 * Weighted compatibility scoring for smart matching (docs/PROPOSAL.md §4.1, §6).
 *
 * Each factor produces a value between 0 and 1. The score is the weighted sum,
 * scaled to 0-100. Weights add up to 1. Every match also carries plain-language
 * reasons so students can see why someone was recommended.
 */
export const WEIGHTS = Object.freeze({
  goals: 0.3,
  interests: 0.3,
  skills: 0.15,
  programme: 0.15,
  year: 0.1,
});

export const GOAL_LABELS = Object.freeze({
  friendship: 'friendship',
  study_partner: 'a study partner',
  networking: 'networking',
  project_collaboration: 'project collaboration',
  mentorship: 'mentorship',
});

const intersect = (a = [], b = []) => {
  const set = new Set(b);
  return [...new Set(a)].filter((x) => set.has(x));
};

/** Share of the smaller list that overlaps, so a short list is not penalised. */
const overlap = (a = [], b = []) => {
  const smaller = Math.min(new Set(a).size, new Set(b).size);
  return smaller === 0 ? 0 : intersect(a, b).length / smaller;
};

/** Jaccard similarity: shared items divided by all distinct items. */
const jaccard = (a = [], b = []) => {
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect(a, b).length / union;
};

const sameText = (a, b) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

const listText = (items, max = 3) => {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
};

/**
 * Year factor. Normally students in a similar year score higher. When both want
 * mentorship, a gap of one to three years scores highest instead.
 */
function yearFactor(me, other, sharedGoals) {
  if (!me.yearOfStudy || !other.yearOfStudy) return 0;
  const gap = Math.abs(me.yearOfStudy - other.yearOfStudy);
  if (sharedGoals.includes('mentorship') && gap >= 1) return gap <= 3 ? 1 : 0.5;
  return Math.max(0, 1 - gap / 3);
}

/**
 * Skills factor. Shared skills count, and for project collaboration
 * complementary skills (ones the other student has that I do not) count too.
 */
function skillsFactor(me, other, sharedGoals) {
  const shared = overlap(me.skills, other.skills);
  if (!sharedGoals.includes('project_collaboration')) return shared;
  const mine = new Set(me.skills);
  const theirs = new Set(other.skills);
  if (theirs.size === 0) return shared;
  const complementary = [...theirs].filter((s) => !mine.has(s)).length / theirs.size;
  return Math.max(shared, complementary * 0.8);
}

export function scoreMatch(me, other) {
  const sharedGoals = intersect(me.goals, other.goals);
  const sharedInterests = intersect(me.interests, other.interests);
  const sharedSkills = intersect(me.skills, other.skills);
  const sameProgramme = sameText(me.programme, other.programme);

  const factors = {
    goals: overlap(me.goals, other.goals),
    interests: jaccard(me.interests, other.interests),
    skills: skillsFactor(me, other, sharedGoals),
    programme: sameProgramme ? 1 : 0,
    year: yearFactor(me, other, sharedGoals),
  };

  const total = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * factors[key], 0);

  const reasons = [];
  if (sharedGoals.length) reasons.push(`Both looking for ${listText(sharedGoals.map((g) => GOAL_LABELS[g] ?? g))}`);
  if (sharedInterests.length) reasons.push(`Shared interests: ${listText(sharedInterests)}`);
  if (sharedSkills.length) reasons.push(`Shared skills: ${listText(sharedSkills)}`);
  else if (sharedGoals.includes('project_collaboration') && other.skills?.length) {
    reasons.push(`Brings skills you don't list: ${listText(other.skills)}`);
  }
  if (sameProgramme) reasons.push(`Also studies ${other.programme}`);
  if (me.yearOfStudy && other.yearOfStudy) {
    if (me.yearOfStudy === other.yearOfStudy) reasons.push(`Also in year ${other.yearOfStudy}`);
    else if (sharedGoals.includes('mentorship')) reasons.push(`Year ${other.yearOfStudy}, a good mentorship fit`);
  }

  return {
    score: Math.round(total * 100),
    factors,
    reasons,
    shared: { goals: sharedGoals, interests: sharedInterests, skills: sharedSkills },
  };
}

/** A profile needs goals plus interests or skills before matching is meaningful. */
export const isMatchable = (user) =>
  Boolean(user.goals?.length && (user.interests?.length || user.skills?.length));

/** Scores, filters and sorts candidates. Candidates scoring below minScore are dropped. */
export function rankMatches(me, candidates, { minScore = 15, limit = 20 } = {}) {
  return candidates
    .map((user) => ({ user, ...scoreMatch(me, user) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name))
    .slice(0, limit);
}
