import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

describe('PATCH /api/users/me', () => {
  it('updates the profile and normalises tags', async () => {
    const { token } = await createUser();
    const res = await api()
      .patch('/api/users/me')
      .set(bearer(token))
      .send({
        programme: 'Computer Science',
        yearOfStudy: 2,
        bio: 'I like building things.',
        interests: [' Football ', 'football', 'Web  Design'],
        skills: ['Python'],
        goals: ['study_partner', 'study_partner'],
      });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.interests, ['football', 'web design']);
    assert.deepEqual(res.body.user.skills, ['python']);
    assert.deepEqual(res.body.user.goals, ['study_partner']);
    assert.equal(res.body.user.yearOfStudy, 2);
  });

  it('clears fields sent as empty', async () => {
    const { token } = await createUser({ bio: 'Old bio', yearOfStudy: 3 });
    const res = await api().patch('/api/users/me').set(bearer(token)).send({ bio: '', yearOfStudy: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.bio, undefined);
    assert.equal(res.body.user.yearOfStudy, undefined);
  });

  it('cannot change role, status or email', async () => {
    const { token } = await createUser();
    for (const body of [{ role: 'admin' }, { status: 'active' }, { email: 'new@test.local' }]) {
      const res = await api().patch('/api/users/me').set(bearer(token)).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it('rejects invalid goals and too many tags', async () => {
    const { token } = await createUser();
    const badGoal = await api().patch('/api/users/me').set(bearer(token)).send({ goals: ['dating'] });
    assert.equal(badGoal.status, 400);
    const tooMany = await api()
      .patch('/api/users/me')
      .set(bearer(token))
      .send({ interests: Array.from({ length: 16 }, (_, i) => `tag${i}`) });
    assert.equal(tooMany.status, 400);
  });
});

describe('profile prompts', () => {
  it('saves up to three distinct prompts', async () => {
    const { token } = await createUser();
    const res = await api()
      .patch('/api/users/me')
      .set(bearer(token))
      .send({ prompts: [{ question: 'Ask me about…', answer: '  football tactics  ' }] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.prompts, [{ question: 'Ask me about…', answer: 'football tactics' }]);
  });

  it('rejects unknown, repeated or too many prompts', async () => {
    const { token } = await createUser();
    const send = (prompts) => api().patch('/api/users/me').set(bearer(token)).send({ prompts });
    assert.equal((await send([{ question: 'Favourite food?', answer: 'Domoda' }])).status, 400);
    assert.equal((await send([{ question: 'Ask me about…', answer: 'a' }, { question: 'Ask me about…', answer: 'b' }])).status, 400);
    const four = ['We’ll get along if…', 'Ask me about…', 'I can help you with…', 'My ideal study session…'].map((q) => ({ question: q, answer: 'x' }));
    assert.equal((await send(four)).status, 400);
  });
});

describe('GET /api/users/:id', () => {
  it('includes connection, post and community counts', async () => {
    const { token } = await createUser();
    const other = await createUser();
    await api().post('/api/posts').set(bearer(other.token)).send({ content: 'Hello' });
    const res = await api().get(`/api/users/${other.user.id}`).set(bearer(token));
    assert.deepEqual(res.body.stats, { connections: 0, posts: 1, communities: 0 });
  });

  it('shows a public profile without private fields', async () => {
    const { token } = await createUser();
    const { user } = await createUser({ programme: 'Law' });
    const res = await api().get(`/api/users/${user.id}`).set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.programme, 'Law');
    assert.equal(res.body.user.email, undefined);
    assert.equal(res.body.user.status, undefined);
  });

  it('includes match reasons when both profiles are complete', async () => {
    const profile = { interests: ['football'], goals: ['friendship'] };
    const { token } = await createUser(profile);
    const { user } = await createUser(profile);
    const res = await api().get(`/api/users/${user.id}`).set(bearer(token));
    assert.ok(res.body.match.score > 0);
    assert.ok(res.body.match.reasons.length > 0);
  });

  it('hides suspended users and admins from students', async () => {
    const { token } = await createUser();
    const { user: suspended } = await createUser({ status: 'suspended' });
    const { user: admin } = await createUser({ role: 'admin' });
    assert.equal((await api().get(`/api/users/${suspended.id}`).set(bearer(token))).status, 404);
    assert.equal((await api().get(`/api/users/${admin.id}`).set(bearer(token))).status, 404);
  });
});

describe('GET /api/users (discovery)', () => {
  it('filters by programme, year, interests, skills and goal', async () => {
    const { token } = await createUser();
    await createUser({ name: 'Awa', programme: 'Computer Science', yearOfStudy: 2, interests: ['football', 'music'], skills: ['python'], goals: ['study_partner'] });
    await createUser({ name: 'Ebrima', programme: 'Computer Science', yearOfStudy: 3, interests: ['football'], goals: ['networking'] });
    await createUser({ name: 'Mariama', programme: 'Law', yearOfStudy: 2, interests: ['debate'], goals: ['study_partner'] });

    const names = async (query) => {
      const res = await api().get('/api/users').query(query).set(bearer(token));
      assert.equal(res.status, 200);
      return res.body.users.map((u) => u.name).sort();
    };

    assert.deepEqual(await names({ programme: 'computer science' }), ['Awa', 'Ebrima']);
    assert.deepEqual(await names({ year: 2 }), ['Awa', 'Mariama']);
    assert.deepEqual(await names({ interests: 'football,music' }), ['Awa']);
    assert.deepEqual(await names({ skills: 'Python' }), ['Awa']);
    assert.deepEqual(await names({ goal: 'study_partner' }), ['Awa', 'Mariama']);
    assert.deepEqual(await names({ q: 'debate' }), ['Mariama']);
  });

  it('excludes the viewer, admins and inactive accounts', async () => {
    const { token } = await createUser({ name: 'Me' });
    await createUser({ name: 'Visible' });
    await createUser({ name: 'Admin', role: 'admin' });
    await createUser({ name: 'Banned', status: 'banned' });
    const res = await api().get('/api/users').set(bearer(token));
    assert.deepEqual(res.body.users.map((u) => u.name), ['Visible']);
  });

  it('requires authentication', async () => {
    assert.equal((await api().get('/api/users')).status, 401);
  });
});

describe('GET /api/matches', () => {
  it('asks for a complete profile first', async () => {
    const { token } = await createUser();
    const res = await api().get('/api/matches').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.profileIncomplete, true);
    assert.deepEqual(res.body.matches, []);
  });

  it('returns ranked matches with reasons, best first', async () => {
    const { token } = await createUser({ programme: 'Computer Science', yearOfStudy: 2, interests: ['football', 'music'], goals: ['study_partner'] });
    await createUser({ name: 'Best', programme: 'Computer Science', yearOfStudy: 2, interests: ['football', 'music'], goals: ['study_partner'] });
    await createUser({ name: 'Okay', programme: 'Law', yearOfStudy: 4, interests: ['football'], goals: ['study_partner'] });
    await createUser({ name: 'None', programme: 'Physics', interests: ['chess'], goals: ['networking'] });

    const res = await api().get('/api/matches').set(bearer(token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.matches.map((m) => m.user.name), ['Best', 'Okay']);
    assert.ok(res.body.matches[0].score > res.body.matches[1].score);
    assert.ok(res.body.matches[0].reasons.length > 0);
    assert.equal(res.body.matches[0].user.email, undefined);
  });
});

describe('GET /api/meta/options', () => {
  it('returns goals and merges popular student tags into suggestions', async () => {
    const { token } = await createUser({ interests: ['astronomy'], programme: 'Marine Biology' });
    const res = await api().get('/api/meta/options').set(bearer(token));
    assert.equal(res.status, 200);
    assert.ok(res.body.goals.includes('mentorship'));
    assert.ok(res.body.interests.includes('astronomy'));
    assert.ok(res.body.programmes.includes('Marine Biology'));
  });
});
