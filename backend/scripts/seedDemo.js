// Fills the database with realistic demo data spread over the last 60 days, for
// presentations and for trying the statistics module. Every demo student's password is "Password123".
//
//   npm run seed:demo            adds demo data (refuses if demo users already exist)
//   npm run seed:demo -- --reset deletes ALL data first
//
// Starting the server with USE_MEMORY_DB=true and SEED_DEMO=true runs this automatically.
import { seedNotifications } from './seedNotifications.js';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { BACKEND_ROOT, UPLOADS_DIR } from '../src/config/paths.js';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Connection, pairKeyOf } from '../src/models/Connection.js';
import { Community, slugify } from '../src/models/Community.js';
import { Post, Comment } from '../src/models/Post.js';
import { Conversation, Message } from '../src/models/Message.js';
import { Report } from '../src/models/Report.js';
import { Listing } from '../src/models/Listing.js';
import { DEMO_LISTINGS } from './demoListings.js';
import { seedAdmin } from './seedAdmin.js';

const DAY = 86_400_000;
export const DEMO_DOMAIN = 'demo.sunucampus.local';

// Deterministic pseudo-random numbers so every run produces the same data.
let state = 20261121;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
/** A date `daysAgo` days back, at a random time, weighted towards recent days for a growth curve. */
const pastDate = (maxDays) => new Date(Date.now() - Math.floor(rand() ** 1.6 * maxDays * DAY) - between(0, 12) * 3_600_000);

const FIRST = ['Awa', 'Lamin', 'Fatou', 'Ebrima', 'Isatou', 'Modou', 'Mariama', 'Ousman', 'Binta', 'Alieu', 'Haddy', 'Musa', 'Kaddy', 'Omar', 'Ndey', 'Pa', 'Sainabou', 'Bakary', 'Jainaba', 'Abdoulie', 'Adama', 'Yusupha', 'Ramatoulie', 'Sheriff'];
// Used to give each demo student a photo that fits their name.
export const FEMALE = new Set(['Awa', 'Fatou', 'Isatou', 'Mariama', 'Binta', 'Haddy', 'Kaddy', 'Ndey', 'Sainabou', 'Jainaba', 'Ramatoulie']);

/** Photos from `npm run photos:fetch`, copied into uploads. Returns { women: [url], men: [url] }. */
function loadDemoPhotos(log) {
  const source = join(BACKEND_ROOT, 'seed-photos');
  const out = { women: [], men: [] };
  if (!existsSync(source)) {
    log('No seed-photos folder: demo students will use initials (run npm run photos:fetch for real photos)');
    return out;
  }
  const target = join(UPLOADS_DIR, 'avatars');
  mkdirSync(target, { recursive: true });
  for (const group of ['women', 'men']) {
    const dir = join(source, group);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => /.(jpe?g|png|webp)$/i.test(f)).sort()) {
      copyFileSync(join(dir, file), join(target, `demo-${file}`));
      out[group].push(`/uploads/avatars/demo-${file}`);
    }
  }
  log(`Loaded ${out.women.length + out.men.length} demo photos`);
  return out;
}

const LAST = ['Jallow', 'Ceesay', 'Bah', 'Touray', 'Sowe', 'Njie', 'Darboe', 'Camara', 'Jobe', 'Sanneh', 'Drammeh', 'Jatta', 'Manneh', 'Sarr', 'Faye', 'Bojang'];
const PROGRAMMES = ['Computer Science', 'Information Systems', 'Telecommunications', 'Economics', 'Accounting', 'Law', 'Nursing', 'Public Health', 'Biology', 'Mathematics', 'Development Studies'];
const INTERESTS = ['football', 'technology', 'entrepreneurship', 'music', 'photography', 'reading', 'debate', 'research', 'basketball', 'film', 'volunteering', 'fashion', 'poetry', 'gaming'];
const SKILLS = ['web development', 'python', 'graphic design', 'public speaking', 'data analysis', 'writing', 'video editing', 'excel', 'java', 'research methods', 'marketing', 'statistics'];
const GOALS = ['friendship', 'study_partner', 'networking', 'project_collaboration', 'mentorship'];

const BIOS = [
  'Always up for a good study session and better conversations.',
  'Building small apps on weekends. Looking for people to build bigger ones with.',
  'Passionate about community health and outreach.',
  'Final year and happy to help newer students find their feet.',
  'Coffee, code and football, in that order.',
  'Interested in how technology can grow small businesses in The Gambia.',
];

const PROMPT_ANSWERS = [
  { question: 'We’ll get along if…', answer: 'you never say no to attaya after a long lecture.' },
  { question: 'Ask me about…', answer: 'the app I am building for market vendors in Serrekunda.' },
  { question: 'My ideal study session…', answer: 'Library, second floor, phones away, snacks allowed.' },
  { question: 'After class you’ll find me…', answer: 'on the football pitch or at the beach in Kololi.' },
  { question: 'I can help you with…', answer: 'Excel, statistics assignments and CV reviews.' },
  { question: 'A project I’d love to build…', answer: 'a map of every study spot on campus with wifi ratings.' },
  { question: 'I’m on SunuCampus to…', answer: 'find a team for the next hackathon.' },
];

const POSTS = [
  'Anyone else preparing for the data structures exam? Thinking of starting a study group in the library on Thursday.',
  'Looking for a designer to join our hackathon team. We have two developers and a great idea!',
  'Reminder: the career fair is next week. Bring printed CVs.',
  'Just finished my first full-stack project. Happy to share what I learned with anyone starting out.',
  'Who wants to play football on Saturday morning? We need two more players.',
  'Does anyone have notes from the statistics lecture on Monday? I missed it because of a clinic placement.',
  'Our photography walk around Banjul is this Sunday. All skill levels welcome.',
  'Great talk today on entrepreneurship in West Africa. Lots to think about.',
  'Searching for a mentor in data analysis. Any final year students up for it?',
  'The new study room on the second floor is so much quieter. Highly recommend.',
  'Is anyone working on a research project in public health? I would love to collaborate.',
  'Shout out to everyone who volunteered at the beach clean-up!',
];
const COMMENTS = ['Count me in!', 'Great idea.', 'I can help with that.', 'Sending you a message.', 'Thanks for sharing!', 'What time?', 'I am interested too.', 'This is really useful.'];
const MESSAGES = ['Hi! Saw your post about the study group.', 'Are you free on Thursday afternoon?', 'Yes, that works for me.', 'Great, see you at the library.', 'Can you share the slides?', 'Sure, sending them now.', 'Thanks a lot!'];

const COMMUNITIES = [
  { name: 'UTG Developers', category: 'technology', description: 'Coders of every level. Projects, hackathons and help with bugs.' },
  { name: 'Entrepreneurs Hub', category: 'entrepreneurship', description: 'For students starting or dreaming about a business.' },
  { name: 'Campus Football', category: 'sports', description: 'Weekend matches and inter-faculty tournaments.' },
  { name: 'Lens and Light', category: 'photography', description: 'Photo walks, editing tips and exhibitions.' },
  { name: 'Health Research Circle', category: 'research', description: 'Public health and nursing students sharing research ideas.' },
  { name: 'Debate Society', category: 'academic', description: 'Weekly debates and competition preparation.' },
];

async function alreadySeeded() {
  return Boolean(await User.exists({ email: { $regex: `@${DEMO_DOMAIN.replace(/\./g, '\\.')}$` } }));
}

export async function seedDemo({ reset = false, log = console.log } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');
  if (reset) {
    await mongoose.connection.db.dropDatabase();
    log('Database cleared');
  } else if (await alreadySeeded()) {
    log('Demo data already present, skipping (use --reset to start over)');
    return;
  }

  const admin = await seedAdmin();

  // Students
  const photos = loadDemoPhotos(log);
  const students = [];
  for (let i = 0; i < 40; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const createdAt = pastDate(60);
    const profileComplete = rand() > 0.15;
    students.push(
      await User.create({
        name: `${first} ${last}`,
        email: `${first}.${last}${i}@${DEMO_DOMAIN}`.toLowerCase(),
        password: 'Password123',
        programme: pick(PROGRAMMES),
        yearOfStudy: between(1, 4),
        bio: rand() > 0.3 ? pick(BIOS) : undefined,
        interests: profileComplete ? sample(INTERESTS, between(2, 5)) : [],
        skills: profileComplete ? sample(SKILLS, between(1, 4)) : [],
        goals: profileComplete ? sample(GOALS, between(1, 3)) : [],
        prompts: profileComplete ? sample(PROMPT_ANSWERS, between(1, 2)) : [],
        // Most demo students have confirmed their UTG email (blue tick).
        emailVerifiedAt: rand() < 0.7 ? new Date(Math.min(Date.now(), createdAt.getTime() + between(1, 48) * 3_600_000)) : undefined,
        avatarUrl: (FEMALE.has(first) ? photos.women : photos.men).shift(),
        createdAt,
        lastActiveAt: new Date(Math.max(createdAt.getTime(), Date.now() - Math.floor(rand() ** 2 * 30 * DAY))),
      }),
    );
  }
  log(`Created ${students.length} students (password: Password123)`);

  // Connections
  const pairs = new Set();
  let connections = 0;
  for (let i = 0; i < 90; i += 1) {
    const [a, b] = sample(students, 2);
    const key = pairKeyOf(a._id, b._id);
    if (pairs.has(key)) continue;
    pairs.add(key);
    const createdAt = new Date(Math.max(a.createdAt, b.createdAt, pastDate(55)));
    const roll = rand();
    const status = roll < 0.65 ? 'accepted' : roll < 0.8 ? 'rejected' : 'pending';
    await Connection.create({
      requester: a._id,
      recipient: b._id,
      pairKey: key,
      status,
      source: pick(['match', 'match', 'match', 'discover', 'discover', 'profile']),
      createdAt,
      respondedAt: status === 'pending' ? undefined : new Date(Math.min(Date.now() - between(5, 90) * 60_000, createdAt.getTime() + between(1, 48) * 3_600_000)),
    });
    connections += 1;
  }
  log(`Created ${connections} connection requests`);

  // Communities
  const communities = [];
  for (const [index, c] of COMMUNITIES.entries()) {
    const creator = students[index * 3];
    const members = [creator, ...sample(students.filter((s) => s !== creator), between(5, 16))];
    communities.push(
      await Community.create({
        ...c,
        slug: slugify(c.name),
        creator: creator._id,
        moderators: [creator._id],
        members: members.map((m) => m._id),
        memberCount: members.length,
        status: 'active',
        reviewedBy: admin._id,
        reviewedAt: pastDate(50),
        createdAt: pastDate(58),
      }),
    );
    if (creator.role === 'student') await User.updateOne({ _id: creator._id }, { role: 'moderator' });
  }
  await Community.create({
    name: 'Chess Club',
    slug: 'chess-club',
    category: 'other',
    description: 'Casual and competitive chess. Waiting for approval.',
    creator: students[20]._id,
    moderators: [students[20]._id],
    members: [students[20]._id],
    memberCount: 1,
    status: 'pending',
  });
  log(`Created ${communities.length + 1} communities (one awaiting approval)`);

  // Posts, likes and comments
  const posts = [];
  for (let i = 0; i < 70; i += 1) {
    const inCommunity = rand() < 0.45 ? pick(communities) : null;
    const authorId = inCommunity ? pick(inCommunity.members) : null;
    const author = authorId ? students.find((s) => s._id.equals(authorId)) : pick(students);
    const createdAt = new Date(Math.max(author.createdAt, pastDate(55)));
    const likers = sample(students, between(0, 12)).map((s) => s._id);
    posts.push(
      await Post.create({
        author: author._id,
        community: inCommunity?._id,
        content: pick(POSTS),
        likes: likers,
        likeCount: likers.length,
        createdAt,
      }),
    );
  }
  let comments = 0;
  for (const post of posts) {
    const n = between(0, 4);
    for (let j = 0; j < n; j += 1) {
      await Comment.create({
        post: post._id,
        author: pick(students)._id,
        content: pick(COMMENTS),
        createdAt: new Date(Math.min(Date.now() - between(1, 50) * 60_000, post.createdAt.getTime() + between(1, 72) * 3_600_000)),
      });
    }
    if (n) await Post.updateOne({ _id: post._id }, { commentCount: n });
    comments += n;
  }
  log(`Created ${posts.length} posts and ${comments} comments`);

  // Conversations between accepted connections
  const accepted = await Connection.find({ status: 'accepted' }).limit(25);
  let messages = 0;
  for (const c of accepted) {
    const conversation = await Conversation.create({ participants: [c.requester, c.recipient], pairKey: c.pairKey });
    let at = new Date(c.respondedAt.getTime() + between(1, 24) * 3_600_000);
    const n = between(2, 7);
    let last;
    for (let j = 0; j < n && at < new Date(); j += 1) {
      last = await Message.create({
        conversation: conversation._id,
        sender: j % 2 ? c.recipient : c.requester,
        content: MESSAGES[j % MESSAGES.length],
        createdAt: at,
        readAt: rand() > 0.15 ? new Date(at.getTime() + 600_000) : undefined,
      });
      messages += 1;
      at = new Date(at.getTime() + between(5, 600) * 60_000);
    }
    if (last) {
      conversation.lastMessage = { content: last.content, sender: last.sender, createdAt: last.createdAt };
      await conversation.save();
    }
  }
  log(`Created ${messages} messages`);

  // Reports: some open for the queue, some already handled for the statistics.
  const reasons = ['spam', 'harassment', 'inappropriate', 'misinformation', 'other'];
  for (let i = 0; i < 9; i += 1) {
    const post = pick(posts);
    const reporter = pick(students.filter((s) => !s._id.equals(post.author)));
    const createdAt = pastDate(40);
    const handled = i >= 4;
    await Report.create({
      reporter: reporter._id,
      targetType: 'post',
      targetId: post._id,
      reason: pick(reasons),
      details: i % 2 ? 'This looks like spam to me.' : undefined,
      status: handled ? pick(['resolved', 'dismissed']) : 'open',
      action: handled ? 'none' : undefined,
      resolvedBy: handled ? admin._id : undefined,
      resolvedAt: handled ? new Date(createdAt.getTime() + between(2, 30) * 3_600_000) : undefined,
      createdAt,
    }).catch(() => {}); // the same student may already have an open report on that post
  }
  log('Created reports for the moderation queue');

  // Marketplace: one listing per demo item, with its photo when one was downloaded.
  const listingPhotos = join(BACKEND_ROOT, 'seed-photos', 'listings');
  const listingTarget = join(UPLOADS_DIR, 'listings');
  mkdirSync(listingTarget, { recursive: true });
  let listed = 0;
  for (const [i, item] of DEMO_LISTINGS.entries()) {
    // eslint-disable-next-line no-unused-vars
    const { slug, photoQuery, ...fields } = item;
    const source = join(listingPhotos, `${slug}.jpg`);
    const photos = [];
    if (existsSync(source)) {
      copyFileSync(source, join(listingTarget, `demo-${slug}.jpg`));
      photos.push(`/uploads/listings/demo-${slug}.jpg`);
    }
    const createdAt = pastDate(30);
    const sold = i % 6 === 5;
    await Listing.create({
      ...fields,
      photos,
      seller: students[(i * 5 + 3) % students.length]._id,
      status: sold ? 'sold' : 'active',
      soldAt: sold ? new Date(createdAt.getTime() + between(1, 5) * 86_400_000) : undefined,
      createdAt,
    });
    listed += 1;
  }
  log(`Created ${listed} marketplace listings`);
  await seedNotifications({ reset: true, log });
  log('Demo data ready.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../src/config/db.js');
  const { env } = await import('../src/config/env.js');
  await connectDB(env.mongoUri);
  await seedDemo({ reset: process.argv.includes('--reset') });
  await disconnectDB();
}
