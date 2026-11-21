import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, rankMatches, isMatchable, WEIGHTS } from '../src/utils/matching.js';

const student = (overrides = {}) => ({
  name: 'Student',
  programme: 'Computer Science',
  yearOfStudy: 2,
  interests: [],
  skills: [],
  goals: [],
  ...overrides,
});

describe('scoreMatch', () => {
  it('weights add up to 1', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it('scores identical profiles 100', () => {
    const p = { interests: ['football', 'music'], skills: ['python'], goals: ['study_partner'] };
    const { score } = scoreMatch(student(p), student(p));
    assert.equal(score, 100);
  });

  it('scores students with nothing in common 0', () => {
    const a = student({ programme: 'Law', yearOfStudy: 1, interests: ['debate'], skills: ['writing'], goals: ['networking'] });
    const b = student({ programme: 'Physics', yearOfStudy: 4, interests: ['football'], skills: ['python'], goals: ['friendship'] });
    assert.equal(scoreMatch(a, b).score, 0);
  });

  it('ranks more shared interests and goals higher', () => {
    const me = student({ interests: ['football', 'music', 'tech'], goals: ['friendship', 'study_partner'] });
    const close = student({ interests: ['football', 'music', 'tech'], goals: ['friendship', 'study_partner'] });
    const partial = student({ interests: ['football', 'chess'], goals: ['friendship'] });
    assert.ok(scoreMatch(me, close).score > scoreMatch(me, partial).score);
  });

  it('is case-insensitive for programme', () => {
    const { factors } = scoreMatch(student({ programme: 'Computer Science' }), student({ programme: ' computer science ' }));
    assert.equal(factors.programme, 1);
  });

  it('rewards a year gap when both want mentorship', () => {
    const me = student({ yearOfStudy: 1, goals: ['mentorship'] });
    const senior = student({ yearOfStudy: 3, goals: ['mentorship'] });
    const peer = student({ yearOfStudy: 1, goals: ['mentorship'] });
    assert.equal(scoreMatch(me, senior).factors.year, 1);
    // Without mentorship, the same two-year gap scores lower.
    const noMentor = scoreMatch(student({ yearOfStudy: 1, goals: ['friendship'] }), student({ yearOfStudy: 3, goals: ['friendship'] }));
    assert.ok(noMentor.factors.year < 1);
    assert.match(scoreMatch(me, senior).reasons.join(' '), /mentorship fit/);
    assert.ok(scoreMatch(me, peer).score > 0);
  });

  it('values complementary skills for project collaboration', () => {
    const me = student({ skills: ['web development'], goals: ['project_collaboration'] });
    const designer = student({ skills: ['graphic design'], goals: ['project_collaboration'] });
    const result = scoreMatch(me, designer);
    assert.ok(result.factors.skills > 0);
    assert.ok(result.reasons.some((r) => r.includes('graphic design')));

    const noCollab = scoreMatch(student({ skills: ['web development'], goals: ['friendship'] }), student({ skills: ['graphic design'], goals: ['friendship'] }));
    assert.equal(noCollab.factors.skills, 0);
  });

  it('explains matches in plain language', () => {
    const me = student({ interests: ['football', 'music'], goals: ['study_partner'] });
    const other = student({ interests: ['football'], goals: ['study_partner'] });
    const { reasons } = scoreMatch(me, other);
    assert.ok(reasons.includes('Both looking for a study partner'));
    assert.ok(reasons.includes('Shared interests: football'));
    assert.ok(reasons.includes('Also studies Computer Science'));
    assert.ok(reasons.includes('Also in year 2'));
  });

  it('handles missing profile fields', () => {
    const result = scoreMatch({ name: 'A' }, { name: 'B' });
    assert.equal(result.score, 0);
    assert.deepEqual(result.reasons, []);
  });
});

describe('rankMatches', () => {
  it('sorts by score, drops weak matches and respects the limit', () => {
    const me = student({ interests: ['football', 'music'], goals: ['friendship'] });
    const candidates = [
      student({ name: 'Weak', programme: 'Law', yearOfStudy: 5, interests: ['chess'], goals: ['networking'] }),
      student({ name: 'Best', interests: ['football', 'music'], goals: ['friendship'] }),
      student({ name: 'Good', interests: ['football'], goals: ['friendship'] }),
    ];
    const ranked = rankMatches(me, candidates, { minScore: 15, limit: 5 });
    assert.deepEqual(ranked.map((m) => m.user.name), ['Best', 'Good']);
    assert.equal(rankMatches(me, candidates, { limit: 1 }).length, 1);
  });
});

describe('isMatchable', () => {
  it('needs goals plus interests or skills', () => {
    assert.equal(isMatchable(student()), false);
    assert.equal(isMatchable(student({ goals: ['friendship'] })), false);
    assert.equal(isMatchable(student({ goals: ['friendship'], skills: ['python'] })), true);
  });
});
