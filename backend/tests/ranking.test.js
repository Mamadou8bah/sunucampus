import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, bearer, clearDB, createUser, setupDB, teardownDB } from './helpers.js';
import { Connection, pairKeyOf } from '../src/models/Connection.js';
import { Community } from '../src/models/Community.js';
import { Comment, Post } from '../src/models/Post.js';
import { DAY, HOUR, decay, diversify, engagementQuality, interestRelevance, jaccard, relationshipStrength, trendingScore } from '../src/services/rankingMath.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const id = (account) => account.user._id;
const auth = (account) => bearer(account.token);
const feed = (account, query) => api().get('/api/posts').query({ rank: 'relevant', ...query }).set(auth(account));
const connect = (a, b, status = 'accepted') => Connection.create({
  requester: id(a), recipient: id(b), pairKey: pairKeyOf(id(a), id(b)), status,
});
const makePost = (author, content, options = {}) => Post.create({ author: id(author), content, ...options });

test('normalizes phrases, saturates engagement and retains a recency advantage', () => {
  assert.equal(jaccard([' Music ', 'music', 'coding'], ['Coding', 'football']), 1 / 3);
  assert.equal(jaccard([], []), 0);
  assert.ok(interestRelevance('A machine learning meetup!', ['machine learning'], []) > 0.7);
  assert.equal(interestRelevance('An earthen pot', ['art'], []), 0);
  assert.equal(decay(24, 24), Math.exp(-1));
  assert.equal(engagementQuality(0, 0), 0);
  assert.ok(engagementQuality(50, 0) <= 1);
  const now = Date.now();
  const interaction = new Date(now - HOUR);
  assert.ok(relationshipStrength({ connected: true, outgoing: [interaction], incoming: [interaction] }, now)
    > relationshipStrength({ connected: true, outgoing: [interaction], incoming: [] }, now));
  assert.ok(relationshipStrength({ connected: true, outgoing: [interaction] }, now)
    > relationshipStrength({ connected: true, outgoing: [new Date(now - 60 * DAY)] }, now));
  assert.equal(trendingScore({ likes: 1, commenters: 0, participants: 1, age: 0 }), 0);
  assert.ok(trendingScore({ likes: 2, commenters: 1, participants: 3, age: 1 })
    > trendingScore({ likes: 2, commenters: 1, participants: 3, age: 30 }));
});

test('spaces authors and inserts eligible discovery at the configured cadence', () => {
  const authors = ['a', 'a', 'b', 'c', 'd', 'x'];
  const ranked = diversify(authors.map((author, i) => ({ id: '' + i, author, discovery: i === 5 })), { share: 0.2 });
  assert.equal(ranked[4].author, 'x');
  assert.notEqual(ranked[0].author, ranked[1].author);
  assert.equal(new Set(ranked.map((candidate) => candidate.id)).size, authors.length);
});

test('recommends friends of friends and excludes pending, paused and bilateral exclusions', async () => {
  const viewer = await createUser({ programme: 'Computing', interests: ['chess'] });
  const friend = await createUser();
  const mutual = await createUser({ programme: 'Computing', interests: ['chess'] });
  const other = await createUser({ programme: 'Economics', interests: ['chess'] });
  const pending = await createUser({ interests: ['chess'] });
  const optedOut = await createUser({ discoverable: false, interests: ['chess'] });
  const excluded = await createUser({ rankingExcludedUsers: [id(viewer)], interests: ['chess'] });
  const inactive = await createUser({ status: 'suspended', interests: ['chess'] });
  await Promise.all([connect(viewer, friend), connect(friend, mutual), connect(friend, excluded), connect(viewer, pending, 'pending')]);
  const response = await api().get('/api/matches/people').set(auth(viewer));
  assert.equal(response.status, 200);
  const rows = response.body.recommendations;
  assert.equal(rows[0].user.id, String(id(mutual)));
  assert.ok(rows[0].reasons.includes('1 mutual connection'));
  assert.ok(rows.some((row) => row.user.id === String(id(other))));
  for (const account of [viewer, friend, pending, optedOut, excluded, inactive]) {
    assert.ok(!rows.some((row) => row.user.id === String(id(account))));
  }
  assert.equal(new Set(rows.map((row) => row.user.id)).size, rows.length);

  const cold = await createUser({ programme: 'Computing', yearOfStudy: 2, interests: ['chess'] });
  const coldResult = await api().get('/api/matches/people?limit=3').set(auth(cold));
  assert.equal(coldResult.status, 200);
  assert.ok(coldResult.body.recommendations.some((row) => row.reasons.includes('Both studying Computing')));
  assert.ok(coldResult.body.recommendations.some((row) => row.user.programme === 'Economics'));
});

test('ranks relevant posts, keeps chronological mode, and rechecks visibility on a stable snapshot', async () => {
  const viewer = await createUser({ interests: ['chess'] });
  const author = await createUser();
  const discovery = await createUser({ interests: ['chess'] });
  const excluded = await createUser({ rankingExcludedUsers: [id(viewer)] });
  await connect(viewer, author);
  const first = await makePost(author, 'Chess club meetup', { createdAt: new Date(Date.now() - 3 * HOUR) });
  const second = await makePost(author, 'A quiet campus update');
  const third = await makePost(discovery, 'Chess tournament this weekend');
  const duplicate = await makePost(author, 'Chess club meetup', { createdAt: new Date(Date.now() - 4 * HOUR) });
  const hidden = await makePost(author, 'Chess hidden', { status: 'hidden' });
  const muted = await makePost(excluded, 'Chess from excluded account');
  const privateCommunity = await Community.create({ name: 'Waiting', slug: 'waiting', category: 'other', creator: id(author), status: 'pending' });
  const privatePost = await makePost(author, 'Chess in pending community', { community: privateCommunity._id });
  const initial = await feed(viewer, { limit: 1 });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.posts[0].id, first.id);
  assert.equal(initial.body.total, 3);
  const chronological = await api().get('/api/posts?scope=campus').set(auth(viewer));
  assert.ok(chronological.body.posts.some((post) => post.id === duplicate.id));
  const full = await feed(viewer, { snapshot: initial.body.snapshot, limit: 20 });
  const original = full.body.posts.map((post) => post.id);
  assert.ok(original.includes(second.id) && original.includes(third.id));
  for (const item of [hidden, muted, privatePost, duplicate]) assert.ok(!original.includes(item.id));
  await makePost(author, 'Brand new chess post');
  await api().put('/api/posts/' + original[1] + '/dismiss').set(auth(viewer)).expect(204);
  const pageTwo = await feed(viewer, { snapshot: initial.body.snapshot, limit: 1, page: 2 });
  assert.deepEqual(pageTwo.body.posts, []);
  const pageThree = await feed(viewer, { snapshot: initial.body.snapshot, limit: 1, page: 3 });
  assert.equal(pageThree.body.posts[0].id, original[2]);
  await Post.updateOne({ _id: original[2] }, { status: 'hidden' });
  assert.deepEqual((await feed(viewer, { snapshot: initial.body.snapshot, limit: 1, page: 3 })).body.posts, []);
  assert.equal((await feed(author, { snapshot: initial.body.snapshot })).status, 409);
});

test('trending uses fresh likes and distinct recent commenters, with different time windows', async () => {
  const viewer = await createUser();
  const a = await createUser();
  const b = await createUser();
  const healthy = await makePost(viewer, 'Recent conversation');
  const repetitive = await makePost(viewer, 'Repeated comments');
  const older = await makePost(viewer, 'Earlier this week', { createdAt: new Date(Date.now() - 4 * DAY) });
  await api().put('/api/posts/' + healthy.id + '/like').set(auth(a)).expect(200);
  await api().post('/api/posts/' + healthy.id + '/comments').set(auth(b)).send({ content: 'A different student replied' }).expect(201);
  await Comment.insertMany(Array.from({ length: 12 }, () => ({ post: repetitive._id, author: id(a), content: 'Same participant' })));
  await Comment.insertMany([a, b].map((author) => ({ post: older._id, author: id(author), content: 'A real reply', createdAt: new Date(Date.now() - 3 * DAY) })));
  const today = await feed(viewer, { rank: 'trending', window: 'today' });
  assert.equal(today.status, 200);
  assert.deepEqual(today.body.posts.map((post) => post.id), [healthy.id]);
  const week = await feed(viewer, { rank: 'trending', window: 'week' });
  assert.deepEqual(week.body.posts.map((post) => post.id), [healthy.id, older.id]);
  await api().delete('/api/posts/' + healthy.id + '/like').set(auth(a)).expect(200);
  assert.deepEqual((await feed(viewer, { rank: 'trending', window: 'today' })).body.posts, []);
});

test('highlights one discussion per author and keeps empty-profile feeds useful', async () => {
  const viewer = await createUser({ interests: ['chess'] });
  const friend = await createUser();
  const candidate = await createUser();
  const newcomer = await createUser();
  await connect(viewer, friend);
  const post = await makePost(candidate, 'Chess society is running an open tournament in the student hall.');
  const second = await makePost(candidate, 'The chess tournament signups open tomorrow afternoon on campus.');
  await Comment.insertMany([post, second].map((item) => ({ post: item._id, author: id(friend), content: 'I want to join.' })));
  const ranked = await feed(viewer);
  assert.equal(ranked.status, 200);
  assert.equal(ranked.body.highlights.length, 1);
  assert.equal(ranked.body.highlights[0].reason, 'Your connections are discussing this');
  const cold = await feed(newcomer);
  assert.equal(cold.status, 200);
  assert.equal(cold.body.evaluation.discovery, 2);
  assert.equal(cold.body.evaluation.uniqueAuthors, 1);
});
