import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Community, COMMUNITY_CATEGORIES } from '../src/models/Community.js';
import { User } from '../src/models/User.js';
import { AuditLog } from '../src/models/AuditLog.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const list = (token) => api().get('/api/notifications').set(bearer(token));

async function postBy(author) {
  const { body } = await api().post('/api/posts').set(bearer(author.token)).send({ content: 'Anyone up for a study group on Friday?' });
  return body.post.id;
}

describe('notifications', () => {
  it('requires authentication', async () => {
    assert.equal((await api().get('/api/notifications')).status, 401);
  });

  it('groups likes on the same post into one notification', async () => {
    const author = await createUser({ name: 'Author' });
    const a = await createUser({ name: 'Awa' });
    const b = await createUser({ name: 'Lamin' });
    const postId = await postBy(author);
    await api().put(`/api/posts/${postId}/like`).set(bearer(a.token));
    await api().put(`/api/posts/${postId}/like`).set(bearer(b.token));
    await api().put(`/api/posts/${postId}/like`).set(bearer(b.token)); // repeat like: no change

    const res = await list(author.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 1);
    const [n] = res.body.notifications;
    assert.equal(n.type, 'like');
    assert.equal(n.actorCount, 2);
    assert.equal(n.actors[0].name, 'Lamin'); // most recent first
    assert.equal(n.post.id, postId);
    assert.equal(res.body.unread, 1);
  });

  it('notifies about comments but never about your own actions', async () => {
    const author = await createUser();
    const other = await createUser({ name: 'Commenter' });
    const postId = await postBy(author);
    await api().post(`/api/posts/${postId}/comments`).set(bearer(author.token)).send({ content: 'Bump' });
    await api().put(`/api/posts/${postId}/like`).set(bearer(author.token));
    await api().post(`/api/posts/${postId}/comments`).set(bearer(other.token)).send({ content: 'Count me in' });

    const { body } = await list(author.token);
    assert.equal(body.notifications.length, 1);
    assert.equal(body.notifications[0].type, 'comment');
    assert.equal(body.notifications[0].text, 'Count me in');
  });

  it('notifies about connection requests and acceptances', async () => {
    const a = await createUser({ name: 'Asker' });
    const b = await createUser({ name: 'Answerer' });
    const sent = await api().post('/api/connections').set(bearer(a.token)).send({ recipientId: b.user.id });
    assert.equal((await list(b.token)).body.notifications[0].type, 'connection_request');

    await api().patch(`/api/connections/${sent.body.connection.id}`).set(bearer(b.token)).send({ action: 'accept' });
    const forA = (await list(a.token)).body.notifications;
    assert.equal(forA[0].type, 'connection_accepted');
    assert.equal(forA[0].actors[0].name, 'Answerer');
  });

  it('tells the creator when their community is approved', async () => {
    const creator = await createUser();
    const admin = await createUser({ role: 'admin' });
    const community = await Community.create({ name: 'Chess Club', slug: 'chess-club', category: COMMUNITY_CATEGORIES[0], creator: creator.user._id, members: [creator.user._id] });
    await api().patch(`/api/admin/communities/${community.id}/status`).set(bearer(admin.token)).send({ status: 'active' });
    const [n] = (await list(creator.token)).body.notifications;
    assert.equal(n.type, 'community_approved');
    assert.equal(n.community.slug, 'chess-club');
  });

  it('marks notifications as read', async () => {
    const author = await createUser();
    const other = await createUser();
    const postId = await postBy(author);
    await api().post(`/api/posts/${postId}/comments`).set(bearer(other.token)).send({ content: 'Nice' });
    await api().put(`/api/posts/${postId}/like`).set(bearer(other.token));
    assert.equal((await api().get('/api/notifications/unread').set(bearer(author.token))).body.unread, 2);

    const res = await api().post('/api/notifications/read').set(bearer(author.token)).send({});
    assert.equal(res.body.unread, 0);
    assert.ok((await list(author.token)).body.notifications.every((n) => n.read));
  });

  it('only shows a student their own notifications', async () => {
    const author = await createUser();
    const other = await createUser();
    const postId = await postBy(author);
    await api().put(`/api/posts/${postId}/like`).set(bearer(other.token));
    assert.equal((await list(other.token)).body.notifications.length, 0);
  });
});

describe('admin warnings', () => {
  it('warns a student, records it and notifies them', async () => {
    const student = await createUser();
    const admin = await createUser({ role: 'admin' });
    const message = 'Please keep posts about campus life and stop advertising.';
    const res = await api().post(`/api/admin/users/${student.user.id}/warn`).set(bearer(admin.token)).send({ message });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.warningCount, 1);
    assert.equal((await User.findById(student.user.id)).warningCount, 1);
    assert.equal(await AuditLog.countDocuments({ action: 'user.warned' }), 1);

    const [n] = (await list(student.token)).body.notifications;
    assert.equal(n.type, 'warning');
    assert.equal(n.text, message);
  });

  it('is admin-only and validates the message', async () => {
    const student = await createUser();
    const admin = await createUser({ role: 'admin' });
    assert.equal((await api().post(`/api/admin/users/${admin.user.id}/warn`).set(bearer(student.token)).send({ message: 'You have been warned!' })).status, 403);
    assert.equal((await api().post(`/api/admin/users/${student.user.id}/warn`).set(bearer(admin.token)).send({ message: 'Stop' })).status, 400);
    assert.equal((await api().post(`/api/admin/users/${admin.user.id}/warn`).set(bearer(admin.token)).send({ message: 'Administrators cannot be warned.' })).status, 400);
  });

  it('can warn the author when resolving a report, with a default message', async () => {
    const author = await createUser();
    const reporter = await createUser();
    const admin = await createUser({ role: 'admin' });
    const postId = await postBy(author);
    const r = await api().post('/api/reports').set(bearer(reporter.token)).send({ targetType: 'post', targetId: postId, reason: 'spam' });
    const res = await api().patch(`/api/admin/reports/${r.body.report.id}`).set(bearer(admin.token)).send({ status: 'resolved', action: 'user_warned' });
    assert.equal(res.status, 200);
    const [n] = (await list(author.token)).body.notifications;
    assert.equal(n.type, 'warning');
    assert.match(n.text, /spam/);
  });

  it('tells authors when an admin removes their post', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const postId = await postBy(author);
    await api().patch(`/api/admin/posts/${postId}/status`).set(bearer(admin.token)).send({ status: 'removed', reason: 'Off-topic advertising' });
    const [n] = (await list(author.token)).body.notifications;
    assert.equal(n.type, 'content_moderated');
    assert.equal(n.subject, 'post');
    assert.equal(n.text, 'Off-topic advertising');
  });
});
