import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Community } from '../src/models/Community.js';
import { Post } from '../src/models/Post.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const post = (token, body) => api().post('/api/posts').set(bearer(token)).send(body);
const feed = (token, query = {}) => api().get('/api/posts').query(query).set(bearer(token));

async function activeCommunity(token, name = 'Photography Club') {
  const res = await api().post('/api/communities').set(bearer(token)).send({ name, category: 'photography' });
  await Community.updateOne({ _id: res.body.community.id }, { status: 'active' });
  return res.body.community;
}

describe('campus feed', () => {
  it('creates a post and shows it in everyone’s feed, newest first', async () => {
    const a = await createUser({ name: 'Awa' });
    const b = await createUser();
    await post(a.token, { content: 'First post' });
    const res = await post(a.token, { content: 'Second post' });
    assert.equal(res.status, 201);
    assert.equal(res.body.post.author.name, 'Awa');
    assert.equal(res.body.post.author.email, undefined);
    assert.equal(res.body.post.isAuthor, true);

    const list = await feed(b.token);
    assert.deepEqual(list.body.posts.map((p) => p.content), ['Second post', 'First post']);
    assert.equal(list.body.posts[0].canDelete, false);
  });

  it('splits the feed into "for you" (connections and communities) and "campus" (everything public)', async () => {
    const me = await createUser();
    const friend = await createUser();
    const stranger = await createUser();
    const req = await api().post('/api/connections').set(bearer(me.token)).send({ recipientId: friend.user.id });
    await api().patch(`/api/connections/${req.body.connection.id}`).set(bearer(friend.token)).send({ action: 'accept' });

    await post(friend.token, { content: 'From a friend' });
    await post(stranger.token, { content: 'From a stranger' });
    const community = await activeCommunity(stranger.token);
    await post(stranger.token, { content: 'In a community I am not in', community: community.id });

    const contents = async (scope) => (await feed(me.token, { scope })).body.posts.map((p) => p.content).sort();
    assert.deepEqual(await contents('foryou'), ['From a friend']);
    assert.deepEqual(await contents('campus'), ['From a friend', 'From a stranger', 'In a community I am not in']);

    await api().post(`/api/communities/${community.id}/join`).set(bearer(me.token));
    assert.deepEqual(await contents('foryou'), ['From a friend', 'In a community I am not in']);

    await api().post('/api/connections').set(bearer(me.token)).send({ recipientId: stranger.user.id });
    await post(me.token, { content: 'My newer post' });
    const privateCommunity = await api().post('/api/communities').set(bearer(friend.token)).send({ name: 'Pending group', category: 'academic' });
    await Post.create({ author: friend.user.id, community: privateCommunity.body.community.id, content: 'Private post' });
    const friends = await feed(me.token, { scope: 'friends' });
    assert.equal(friends.status, 200);
    assert.deepEqual(friends.body.posts.map((p) => p.content), ['My newer post', 'From a friend']);
  });

  it('validates content', async () => {
    const { token } = await createUser();
    assert.equal((await post(token, { content: '   ' })).status, 400);
    assert.equal((await post(token, { content: 'x'.repeat(2001) })).status, 400);
  });

  it('filters by author for profile pages', async () => {
    const a = await createUser();
    const b = await createUser();
    await post(a.token, { content: 'By A' });
    await post(b.token, { content: 'By B' });
    const res = await feed(b.token, { author: a.user.id });
    assert.deepEqual(res.body.posts.map((p) => p.content), ['By A']);
  });
});

describe('community posts', () => {
  it('requires membership to post, and shows community posts only to members in the feed', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const community = await activeCommunity(owner.token);

    assert.equal((await post(outsider.token, { content: 'Hi', community: community.id })).status, 403);
    const created = await post(owner.token, { content: 'Welcome!', community: community.id });
    assert.equal(created.status, 201);
    assert.equal(created.body.post.community.slug, 'photography-club');

    assert.equal((await feed(outsider.token)).body.total, 0);
    assert.equal((await feed(owner.token)).body.total, 1);
    // Anyone can read an active community's page.
    assert.equal((await feed(outsider.token, { community: community.id })).body.total, 1);
  });

  it('lets community moderators pin and remove posts in their community', async () => {
    const owner = await createUser();
    const member = await createUser();
    const community = await activeCommunity(owner.token);
    await api().post(`/api/communities/${community.id}/join`).set(bearer(member.token));

    const first = await post(member.token, { content: 'Older', community: community.id });
    await post(member.token, { content: 'Newer', community: community.id });

    const asOwner = await feed(owner.token, { community: community.id });
    assert.ok(asOwner.body.posts.every((p) => p.canDelete && p.canPin));

    assert.equal((await api().patch(`/api/posts/${first.body.post.id}/pin`).set(bearer(member.token)).send({ pinned: true })).status, 403);
    await api().patch(`/api/posts/${first.body.post.id}/pin`).set(bearer(owner.token)).send({ pinned: true });
    const pinned = await feed(member.token, { community: community.id });
    assert.deepEqual(pinned.body.posts.map((p) => p.content), ['Older', 'Newer']);

    assert.equal((await api().delete(`/api/posts/${first.body.post.id}`).set(bearer(owner.token))).status, 204);
    const removed = await Post.findById(first.body.post.id);
    assert.equal(removed.status, 'removed');
    assert.equal(removed.moderatedBy.toString(), owner.user.id);
  });

  it('blocks interaction in archived communities', async () => {
    const owner = await createUser();
    const community = await activeCommunity(owner.token);
    const created = await post(owner.token, { content: 'Hello', community: community.id });
    await Community.updateOne({ _id: community.id }, { status: 'archived' });

    assert.equal((await api().put(`/api/posts/${created.body.post.id}/like`).set(bearer(owner.token))).status, 400);
    assert.equal((await post(owner.token, { content: 'More', community: community.id })).status, 403);
  });
});

describe('likes', () => {
  it('likes once per student and unlikes', async () => {
    const a = await createUser();
    const b = await createUser();
    const { body } = await post(a.token, { content: 'Like me' });
    const id = body.post.id;

    await api().put(`/api/posts/${id}/like`).set(bearer(b.token));
    const twice = await api().put(`/api/posts/${id}/like`).set(bearer(b.token));
    assert.deepEqual(twice.body, { likeCount: 1, likedByMe: true });

    const list = await feed(b.token);
    assert.equal(list.body.posts[0].likedByMe, true);

    const unliked = await api().delete(`/api/posts/${id}/like`).set(bearer(b.token));
    assert.deepEqual(unliked.body, { likeCount: 0, likedByMe: false });
    const again = await api().delete(`/api/posts/${id}/like`).set(bearer(b.token));
    assert.equal(again.body.likeCount, 0);
  });
});

describe('deleting and comments', () => {
  it('lets only the author (or an admin) delete a campus post', async () => {
    const a = await createUser();
    const b = await createUser();
    const admin = await createUser({ role: 'admin' });
    const p1 = await post(a.token, { content: 'One' });
    const p2 = await post(a.token, { content: 'Two' });

    assert.equal((await api().delete(`/api/posts/${p1.body.post.id}`).set(bearer(b.token))).status, 403);
    assert.equal((await api().delete(`/api/posts/${p1.body.post.id}`).set(bearer(a.token))).status, 204);
    assert.equal((await api().delete(`/api/posts/${p2.body.post.id}`).set(bearer(admin.token))).status, 204);
    assert.equal((await feed(b.token)).body.total, 0);
    assert.equal((await api().get(`/api/posts/${p1.body.post.id}`).set(bearer(a.token))).status, 404);
  });

  it('adds, lists and deletes comments, keeping the count in sync', async () => {
    const a = await createUser();
    const b = await createUser({ name: 'Bintou' });
    const { body } = await post(a.token, { content: 'Discuss' });
    const id = body.post.id;

    const c1 = await api().post(`/api/posts/${id}/comments`).set(bearer(b.token)).send({ content: 'Nice' });
    assert.equal(c1.status, 201);
    assert.equal(c1.body.comment.author.name, 'Bintou');
    await api().post(`/api/posts/${id}/comments`).set(bearer(a.token)).send({ content: 'Thanks' });

    const list = await api().get(`/api/posts/${id}/comments`).set(bearer(a.token));
    assert.deepEqual(list.body.comments.map((c) => c.content), ['Nice', 'Thanks']);
    assert.equal((await api().get(`/api/posts/${id}`).set(bearer(a.token))).body.post.commentCount, 2);

    // The post author cannot delete someone else's comment on a campus post.
    assert.equal((await api().delete(`/api/posts/${id}/comments/${c1.body.comment.id}`).set(bearer(a.token))).status, 403);
    assert.equal((await api().delete(`/api/posts/${id}/comments/${c1.body.comment.id}`).set(bearer(b.token))).status, 204);
    assert.equal((await api().get(`/api/posts/${id}`).set(bearer(a.token))).body.post.commentCount, 1);
  });
});
