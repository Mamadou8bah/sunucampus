import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Community } from '../src/models/Community.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const search = (token, query) => api().get('/api/search').query(query).set(bearer(token));

describe('GET /api/search', () => {
  async function seed() {
    const me = await createUser({ name: 'Viewer' });
    await createUser({ name: 'Fatou Ceesay', programme: 'Law' });
    await createUser({ name: 'Ebrima Jallow', interests: ['football'] });
    await createUser({ name: 'Hidden Admin', role: 'admin' });
    await createUser({ name: 'Banned Football Fan', status: 'banned', interests: ['football'] });
    const owner = await createUser();
    const c = await api().post('/api/communities').set(bearer(owner.token)).send({ name: 'Campus Football', category: 'sports' });
    await Community.updateOne({ _id: c.body.community.id }, { status: 'active' });
    await api().post('/api/communities').set(bearer(owner.token)).send({ name: 'Football Pending', category: 'sports' });
    await api().post('/api/posts').set(bearer(owner.token)).send({ content: 'Football this Saturday?' });
    return me;
  }

  it('finds people, communities and posts in one search', async () => {
    const me = await seed();
    const res = await search(me.token, { q: 'football' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.people.map((p) => p.name), ['Ebrima Jallow']);
    assert.deepEqual(res.body.communities.map((c) => c.name), ['Campus Football']);
    assert.deepEqual(res.body.posts.map((p) => p.content), ['Football this Saturday?']);
    assert.equal(res.body.people[0].email, undefined);
  });

  it('never returns admins, inactive accounts, pending communities or the viewer', async () => {
    const me = await seed();
    const all = await search(me.token, { q: 'a' });
    const names = all.body.people.map((p) => p.name);
    assert.ok(!names.includes('Hidden Admin'));
    assert.ok(!names.includes('Banned Football Fan'));
    assert.ok(!names.includes('Viewer'));
    assert.ok(!all.body.communities.some((c) => c.name === 'Football Pending'));
  });

  it('limits results to one type when asked', async () => {
    const me = await seed();
    const res = await search(me.token, { q: 'fatou', type: 'people' });
    assert.deepEqual(res.body.people.map((p) => p.name), ['Fatou Ceesay']);
    assert.deepEqual(res.body.communities, []);
    assert.deepEqual(res.body.posts, []);
  });

  it('treats the query as text, not a pattern, and requires one', async () => {
    const me = await seed();
    assert.equal((await search(me.token, { q: '.*' })).body.people.length, 0);
    assert.equal((await search(me.token, { q: '' })).status, 400);
  });
});
