import { rankingConfig } from '../config/ranking.js';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const clamp = (value) => Math.max(0, Math.min(1, value));
export const decay = (hours, period = rankingConfig.recencyHours) => Number.isFinite(hours) ? Math.exp(-Math.max(0, hours) / period) : 0;
export const ageHours = (date, now) => date ? (now - new Date(date).getTime()) / HOUR : Infinity;
export const normalize = (value) => (value ?? '').normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
export const tokens = (value = '') => normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];
const normalizedSet = (values = []) => new Set(values.map(normalize).filter(Boolean));

export function sharedValues(a, b) {
  const right = normalizedSet(b);
  return [...normalizedSet(a)].filter((item) => right.has(item));
}

export function jaccard(a = [], b = []) {
  const left = normalizedSet(a);
  const right = normalizedSet(b);
  const shared = [...left].filter((item) => right.has(item)).length;
  return shared / (left.size + right.size - shared || 1);
}

export function weighted(signals, weights) {
  let score = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    // Missing signals represent data the product does not collect.
    if (signals[key] === undefined) continue;
    total += weight;
    score += weight * clamp(signals[key]);
  }
  return total ? score / total : 0;
}

export function interestRelevance(text, interests, authorInterests) {
  const terms = ' ' + tokens(text).join(' ') + ' ';
  const phrases = [...normalizedSet(interests)].map((interest) => tokens(interest).join(' ')).filter(Boolean);
  const hits = phrases.filter((phrase) => terms.includes(' ' + phrase + ' ')).length;
  return clamp(0.75 * (hits / Math.min(3, phrases.length || 1)) + 0.25 * jaccard(interests, authorInterests));
}

export function engagementQuality(likes, commenters) {
  return clamp(Math.log1p(likes + 2 * commenters) / Math.log1p(35));
}

export function relationshipStrength({ connected, mutual = 0, communities = 0, outgoing = [], incoming = [] }, now) {
  const interaction = (dates) => clamp(dates.slice(0, 3).reduce((sum, date) => sum + decay(ageHours(date, now), 14 * 24), 0) / 3);
  const sent = interaction(outgoing);
  const received = interaction(incoming);
  return clamp(0.35 * Number(connected) + 0.15 * clamp(mutual / 5) + 0.15 * clamp(communities / 3)
    + 0.20 * (sent + received) / 2 + 0.15 * Math.min(sent, received));
}

export function peopleScore(viewer, candidate, { mutual, sharedCommunities, proximity = 0, now }) {
  const interests = sharedValues(viewer.interests, candidate.interests);
  const sameProgramme = Boolean(viewer.programme && candidate.programme && normalize(viewer.programme) === normalize(candidate.programme));
  const sameYear = Boolean(viewer.yearOfStudy && viewer.yearOfStudy === candidate.yearOfStudy);
  const reasons = [];
  if (mutual) reasons.push(mutual + (mutual === 1 ? ' mutual connection' : ' mutual connections'));
  if (interests.length) reasons.push('You share ' + interests.length + (interests.length === 1 ? ' interest' : ' interests'));
  if (sameProgramme) reasons.push('Both studying ' + viewer.programme);
  if (sharedCommunities) reasons.push(sharedCommunities + (sharedCommunities === 1 ? ' shared community' : ' shared communities'));
  if (sameYear) reasons.push('Same year of study');
  const score = weighted({
    mutual: clamp(mutual / 5),
    interests: jaccard(viewer.interests, candidate.interests),
    programme: Number(sameProgramme),
    communities: clamp(sharedCommunities / 3),
    year: Number(sameYear),
    activity: decay(ageHours(candidate.lastActiveAt, now), 7 * 24),
  }, rankingConfig.people);
  return { score, proximity, reasons };
}

export function trendingScore({ likes, commenters, participants, age }) {
  if (participants < 2) return 0;
  return (2 * likes + 4 * commenters) / Math.pow(Math.max(0, age) + 2, 1.2) * clamp(participants / 4);
}

export const byScore = (a, b) => b.score - a.score || b.created - a.created || a.id.localeCompare(b.id);

/** Short spacing rules discourage repetition while allowing sparse pools to fill every slot. */
export function diversify(rows, { share = 0, groupKey = 'category', authorDistance = 3 } = {}) {
  const pending = [...rows];
  const result = [];
  let explored = 0;
  while (pending.length) {
    const target = Math.floor((result.length + 1) * share + 1e-9);
    const discovering = explored < target;
    const recent = result.slice(-authorDistance);
    const eligible = (row) => !recent.some((previous) => previous.author === row.author)
      && (!row[groupKey] || !result.slice(-2).every((previous) => previous[groupKey] === row[groupKey]) || result.length < 2);
    let index = discovering ? pending.findIndex((row) => row.discovery && eligible(row)) : -1;
    if (index < 0) index = pending.findIndex((row) => !row.discovery && eligible(row));
    if (index < 0) index = pending.findIndex(eligible);
    if (index < 0) index = pending.findIndex((row) => !row.discovery);
    if (index < 0) index = 0;
    const [row] = pending.splice(index, 1);
    result.push(row);
    if (row.discovery) explored += 1;
  }
  return result;
}
