import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { buildRange } from '../src/services/stats.js';
import { toCsv } from '../src/services/csv.js';
import { User } from '../src/models/User.js';
import { Post } from '../src/models/Post.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const today = () => new Date().toISOString().slice(0, 10);

describe('buildRange', () => {
  it('defaults to the last 30 days by day, with a bucket for every day', () => {
    const r = buildRange();
    assert.equal(r.interval, 'day');
    assert.equal(r.buckets.length, 30);
  });

  it('picks weekly or monthly buckets for longer ranges', () => {
    assert.equal(buildRange({ from: '2026-01-01', to: '2026-03-31' }).interval, 'week');
    assert.equal(buildRange({ from: '2025-01-01', to: '2026-01-01' }).interval, 'month');
    assert.equal(buildRange({ from: '2026-01-01', to: '2026-03-31', interval: 'month' }).buckets.length, 3);
  });

  it('includes the whole of the end date', () => {
    const r = buildRange({ from: '2026-05-01', to: '2026-05-01' });
    assert.equal(r.to.toISOString(), '2026-05-01T23:59:59.999Z');
  });
});

describe('toCsv', () => {
  it('quotes special characters and neutralises formulas', () => {
    assert.equal(toCsv([['a,b', 'say "hi"', '=SUM(A1)', 3]]), '"a,b","say ""hi""",\'=SUM(A1),3');
  });
});

describe('GET /api/admin/stats', () => {
  async function seed() {
    const admin = await createUser({ role: 'admin' });
    const a = await createUser({ programme: 'Computer Science', yearOfStudy: 2, interests: ['football', 'music'], goals: ['study_partner'] });
    const b = await createUser({ programme: 'Computer Science', yearOfStudy: 3, interests: ['football'], goals: ['study_partner'] });
    const c = await createUser({ programme: 'Law' });

    const req = await api().post('/api/connections').set(bearer(a.token)).send({ recipientId: b.user.id, source: 'match' });
    await api().patch(`/api/connections/${req.body.connection.id}`).set(bearer(b.token)).send({ action: 'accept' });
    const req2 = await api().post('/api/connections').set(bearer(c.token)).send({ recipientId: a.user.id, source: 'discover' });
    await api().patch(`/api/connections/${req2.body.connection.id}`).set(bearer(a.token)).send({ action: 'reject' });

    const post = await api().post('/api/posts').set(bearer(a.token)).send({ content: 'Study group tonight?' });
    await api().put(`/api/posts/${post.body.post.id}/like`).set(bearer(b.token));
    await api().post(`/api/posts/${post.body.post.id}/comments`).set(bearer(b.token)).send({ content: 'Count me in' });

    const conv = await api().post('/api/conversations').set(bearer(a.token)).send({ userId: b.user.id });
    await api().post(`/api/conversations/${conv.body.conversation.id}/messages`).set(bearer(a.token)).send({ content: 'Hi' });

    await api().post('/api/reports').set(bearer(b.token)).send({ targetType: 'user', targetId: c.user.id, reason: 'spam' });
    return { admin, a, b, c };
  }

  it('is admin-only', async () => {
    const { token } = await createUser();
    assert.equal((await api().get('/api/admin/stats').set(bearer(token))).status, 403);
  });

  it('reports every section for the range', async () => {
    const { admin } = await seed();
    const res = await api().get('/api/admin/stats').query({ from: today(), to: today() }).set(bearer(admin.token));
    assert.equal(res.status, 200);
    const s = res.body;

    assert.equal(s.users.total, 4);
    assert.equal(s.users.newInRange, 4);
    assert.equal(s.users.byRole.admin, 1);
    assert.equal(s.users.byProgramme[0].programme, 'Computer Science');
    assert.equal(s.users.registrations.length, 1);
    assert.equal(s.users.registrations[0].count, 4);

    assert.equal(s.engagement.posts, 1);
    assert.equal(s.engagement.comments, 1);
    assert.equal(s.engagement.likes, 1);
    assert.equal(s.engagement.activeAuthors, 2);
    assert.equal(s.engagement.topPosts[0].excerpt, 'Study group tonight?');

    assert.equal(s.connections.requestsSent, 2);
    assert.equal(s.connections.accepted, 1);
    assert.equal(s.connections.rejected, 1);
    assert.equal(s.connections.acceptanceRate, 50);
    assert.equal(s.connections.bySource.match, 1);
    assert.equal(s.connections.fromMatchingRate, 50);
    assert.equal(s.connections.averageConnectionsPerUser, 0.5);

    assert.equal(s.messaging.messages, 1);
    assert.equal(s.messaging.activeConversations, 1);

    assert.equal(s.moderation.received, 1);
    assert.equal(s.moderation.openNow, 1);
    assert.equal(s.moderation.byReason.spam, 1);

    assert.deepEqual(s.popular.interests[0], { value: 'football', count: 2 });
  });

  it('excludes activity outside the range', async () => {
    const { admin } = await seed();
    // Move one user and the post into last year.
    const old = new Date('2025-01-15T12:00:00Z');
    await User.collection.updateOne({ programme: 'Law' }, { $set: { createdAt: old } });
    await Post.collection.updateMany({}, { $set: { createdAt: old } });

    const res = await api().get('/api/admin/stats').query({ from: today(), to: today() }).set(bearer(admin.token));
    assert.equal(res.body.users.newInRange, 3);
    assert.equal(res.body.engagement.posts, 0);
  });

  it('validates the range', async () => {
    const { token } = await createUser({ role: 'admin' });
    assert.equal((await api().get('/api/admin/stats?from=2026-05-02&to=2026-05-01').set(bearer(token))).status, 400);
    assert.equal((await api().get('/api/admin/stats?from=2020-01-01&to=2026-01-01').set(bearer(token))).status, 400);
    assert.equal((await api().get('/api/admin/stats?from=yesterday').set(bearer(token))).status, 400);
  });

  it('returns a single section when asked', async () => {
    const { admin } = await seed();
    const res = await api().get('/api/admin/stats?section=messaging').set(bearer(admin.token));
    assert.ok(res.body.messaging);
    assert.equal(res.body.users, undefined);
  });
});

describe('GET /api/admin/stats/export', () => {
  it('downloads a CSV report and logs the export', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await api().get('/api/admin/stats/export').query({ from: today(), to: today() }).set(bearer(admin.token));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /attachment; filename="sunucampus-all-/);
    assert.match(res.text, /SunuCampus usage report/);
    assert.match(res.text, /Users: summary/);
    assert.match(res.text, /Total users,1/);

    const logs = await api().get('/api/admin/audit-logs').set(bearer(admin.token));
    assert.equal(logs.body.logs[0].action, 'report.exported');
  });
});
