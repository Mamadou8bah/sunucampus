/**
 * Builds demo notifications from the likes, comments and connections already in the
 * database, so every demo account opens to a realistic notifications screen.
 *
 *   node scripts/seedNotifications.js          (only if there are none yet)
 *   node scripts/seedNotifications.js --reset  (replace existing notifications)
 */
import { pathToFileURL } from 'node:url';
import { Post, Comment, CONTENT_STATUS } from '../src/models/Post.js';
import { Connection, CONNECTION_STATUS } from '../src/models/Connection.js';
import { Notification } from '../src/models/Notification.js';

const DAY = 86_400_000;

export async function seedNotifications({ reset = false, log = console.log } = {}) {
  if (reset) await Notification.deleteMany({});
  else if (await Notification.exists({})) {
    log('Notifications already present, skipping');
    return;
  }

  const docs = [];
  // Anything older than two days counts as already seen.
  const readAt = (at) => (Date.now() - at.getTime() > 2 * DAY ? new Date(at.getTime() + DAY / 4) : null);
  const add = (doc, when) => {
    const at = new Date(Math.min(Date.now() - 5 * 60_000, when.getTime()));
    docs.push({ ...doc, readAt: readAt(at), createdAt: at, updatedAt: at });
  };

  const posts = await Post.find({ status: CONTENT_STATUS.VISIBLE }, 'author likes createdAt');
  for (const post of posts) {
    const likers = post.likes.filter((id) => !id.equals(post.author)).reverse();
    if (likers.length) {
      const at = new Date(Math.min(Date.now() - 30 * 60_000, post.createdAt.getTime() + 6 * 3_600_000));
      add({ recipient: post.author, type: 'like', post: post._id, actors: likers.slice(0, 20), actorCount: likers.length }, at);
    }
  }

  const comments = await Comment.find({ status: CONTENT_STATUS.VISIBLE }).populate('post', 'author');
  for (const c of comments) {
    if (!c.post || c.post.author.equals(c.author)) continue;
    add({ recipient: c.post.author, type: 'comment', post: c.post._id, actors: [c.author], actorCount: 1, text: c.content.slice(0, 140) }, c.createdAt);
  }

  const connections = await Connection.find({ status: { $in: [CONNECTION_STATUS.PENDING, CONNECTION_STATUS.ACCEPTED] } });
  for (const c of connections) {
    if (c.status === CONNECTION_STATUS.PENDING) {
      add({ recipient: c.recipient, type: 'connection_request', actors: [c.requester], actorCount: 1 }, c.createdAt);
    } else {
      add({ recipient: c.requester, type: 'connection_accepted', actors: [c.recipient], actorCount: 1 }, c.respondedAt ?? c.createdAt);
    }
  }

  if (docs.length) await Notification.collection.insertMany(docs); // raw insert keeps the dates above
  log(`Created ${docs.length} notifications`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../src/config/db.js');
  const { env } = await import('../src/config/env.js');
  await connectDB(env.mongoUri);
  await seedNotifications({ reset: process.argv.includes('--reset') });
  await disconnectDB();
}
