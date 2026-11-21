import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Report } from '../src/models/Report.js';
import { Post } from '../src/models/Post.js';
import { User } from '../src/models/User.js';
import { AuditLog } from '../src/models/AuditLog.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const report = (token, body) => api().post('/api/reports').set(bearer(token)).send(body);
const resolve = (token, id, body) => api().patch(`/api/admin/reports/${id}`).set(bearer(token)).send(body);

async function reportedPost() {
  const author = await createUser({ name: 'Author' });
  const reporter = await createUser({ name: 'Reporter' });
  const admin = await createUser({ role: 'admin', name: 'Admin' });
  const { body } = await api().post('/api/posts').set(bearer(author.token)).send({ content: 'Buy cheap essays!!!' });
  const r = await report(reporter.token, { targetType: 'post', targetId: body.post.id, reason: 'spam', details: 'Advertising' });
  return { author, reporter, admin, postId: body.post.id, reportId: r.body.report.id };
}

describe('student reports', () => {
  it('creates a report, and a repeat report from the same student is not duplicated', async () => {
    const { reporter, postId } = await reportedPost();
    const again = await report(reporter.token, { targetType: 'post', targetId: postId, reason: 'spam' });
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.equal(await Report.countDocuments(), 1);
  });

  it('validates the target and reason', async () => {
    const { token, user } = await createUser();
    assert.equal((await report(token, { targetType: 'post', targetId: '64b7f0000000000000000000', reason: 'spam' })).status, 404);
    assert.equal((await report(token, { targetType: 'user', targetId: user.id, reason: 'spam' })).status, 400);
    assert.equal((await report(token, { targetType: 'post', targetId: user.id, reason: 'boring' })).status, 400);
  });
});

describe('admin reports queue', () => {
  it('is admin-only', async () => {
    const { reporter } = await reportedPost();
    assert.equal((await api().get('/api/admin/reports').set(bearer(reporter.token))).status, 403);
  });

  it('lists open reports with a preview of the reported content', async () => {
    const { admin } = await reportedPost();
    const res = await api().get('/api/admin/reports?status=open').set(bearer(admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    const [r] = res.body.reports;
    assert.equal(r.target.content, 'Buy cheap essays!!!');
    assert.equal(r.target.author.name, 'Author');
    assert.equal(r.reporter.name, 'Reporter');
    assert.equal(r.openReportsOnTarget, 1);
  });

  it('removes the content, closes every report on it and records the audit trail', async () => {
    const { admin, postId, reportId } = await reportedPost();
    const second = await createUser();
    await report(second.token, { targetType: 'post', targetId: postId, reason: 'inappropriate' });

    const res = await resolve(admin.token, reportId, { status: 'resolved', action: 'content_removed', note: 'Spam' });
    assert.equal(res.status, 200);
    assert.equal(res.body.closedReports, 2);
    assert.equal((await Post.findById(postId)).status, 'removed');
    assert.equal(await Report.countDocuments({ status: 'open' }), 0);

    const actions = (await AuditLog.find()).map((l) => l.action).sort();
    assert.deepEqual(actions, ['post.status_changed', 'report.resolved']);

    assert.equal((await resolve(admin.token, reportId, { status: 'dismissed' })).status, 409);
  });

  it('can suspend the author, which blocks their login', async () => {
    const { admin, author, reportId } = await reportedPost();
    await resolve(admin.token, reportId, { status: 'resolved', action: 'user_suspended', note: 'Repeated spam' });
    const user = await User.findById(author.user.id);
    assert.equal(user.status, 'suspended');
    assert.equal(user.statusReason, 'Repeated spam');
    const login = await api().post('/api/auth/login').send({ email: user.email, password: author.password });
    assert.equal(login.status, 403);
  });

  it('rejects actions that do not fit the content type', async () => {
    const { admin, reportId } = await reportedPost();
    assert.equal((await resolve(admin.token, reportId, { status: 'resolved', action: 'community_archived' })).status, 400);
    assert.equal((await resolve(admin.token, reportId, { status: 'dismissed', action: 'content_removed' })).status, 400);
  });
});

describe('admin post, comment and community moderation', () => {
  it('hides and restores a post, hiding it from the feed', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const { body } = await api().post('/api/posts').set(bearer(author.token)).send({ content: 'Hello' });

    await api().patch(`/api/admin/posts/${body.post.id}/status`).set(bearer(admin.token)).send({ status: 'hidden', reason: 'Checking' });
    assert.equal((await api().get('/api/posts').set(bearer(author.token))).body.total, 0);

    const list = await api().get('/api/admin/posts?status=hidden').set(bearer(admin.token));
    assert.equal(list.body.posts[0].moderationReason, 'Checking');

    await api().patch(`/api/admin/posts/${body.post.id}/status`).set(bearer(admin.token)).send({ status: 'visible' });
    assert.equal((await api().get('/api/posts').set(bearer(author.token))).body.total, 1);
  });

  it('keeps the comment count in step when comments are hidden and restored', async () => {
    const author = await createUser();
    const admin = await createUser({ role: 'admin' });
    const { body } = await api().post('/api/posts').set(bearer(author.token)).send({ content: 'Post' });
    const c = await api().post(`/api/posts/${body.post.id}/comments`).set(bearer(author.token)).send({ content: 'Comment' });

    await api().patch(`/api/admin/comments/${c.body.comment.id}/status`).set(bearer(admin.token)).send({ status: 'hidden' });
    assert.equal((await Post.findById(body.post.id)).commentCount, 0);
    await api().patch(`/api/admin/comments/${c.body.comment.id}/status`).set(bearer(admin.token)).send({ status: 'visible' });
    assert.equal((await Post.findById(body.post.id)).commentCount, 1);
  });

  it('approves a pending community, promoting its creator to moderator', async () => {
    const creator = await createUser();
    const admin = await createUser({ role: 'admin' });
    const created = await api().post('/api/communities').set(bearer(creator.token)).send({ name: 'Chess Club', category: 'other' });

    const pending = await api().get('/api/admin/communities?status=pending').set(bearer(admin.token));
    assert.equal(pending.body.total, 1);
    assert.equal(pending.body.communities[0].creator.id, creator.user.id);

    const res = await api().patch(`/api/admin/communities/${created.body.community.id}/status`).set(bearer(admin.token)).send({ status: 'active' });
    assert.equal(res.status, 200);
    assert.equal((await User.findById(creator.user.id)).role, 'moderator');
    assert.equal((await api().get('/api/communities').set(bearer(creator.token))).body.total, 1);
  });

  it('rejects a community with a reason the creator can see', async () => {
    const creator = await createUser();
    const admin = await createUser({ role: 'admin' });
    const created = await api().post('/api/communities').set(bearer(creator.token)).send({ name: 'Duplicate Club', category: 'other' });
    await api().patch(`/api/admin/communities/${created.body.community.id}/status`).set(bearer(admin.token)).send({ status: 'rejected', reason: 'Already exists' });
    const res = await api().get(`/api/communities/${created.body.community.slug}`).set(bearer(creator.token));
    assert.equal(res.body.community.status, 'rejected');
    assert.equal(res.body.community.statusReason, 'Already exists');
  });
});

describe('GET /api/admin/overview', () => {
  it('summarises platform activity', async () => {
    const { admin } = await reportedPost();
    const res = await api().get('/api/admin/overview').set(bearer(admin.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.counts.totalUsers, 3);
    assert.equal(res.body.counts.openReports, 1);
    assert.equal(res.body.counts.postsTotal, 1);
    assert.equal(res.body.recentUsers.length, 3);
  });
});
