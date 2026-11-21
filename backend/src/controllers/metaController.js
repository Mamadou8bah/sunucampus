import { User } from '../models/User.js';
import { CONNECTION_GOALS, ACCOUNT_STATUS, PROFILE_PROMPTS } from '../config/roles.js';

// Starter suggestions; real values students enter are merged in by popularity.
const DEFAULT_PROGRAMMES = [
  'Computer Science',
  'Information Systems',
  'Telecommunications',
  'Economics',
  'Accounting',
  'Management',
  'Law',
  'Medicine and Surgery',
  'Nursing',
  'Public Health',
  'Agriculture',
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'English',
  'Political Science',
  'Development Studies',
];

const DEFAULT_INTERESTS = ['technology', 'entrepreneurship', 'football', 'research', 'photography', 'music', 'reading', 'debate'];
const DEFAULT_SKILLS = ['web development', 'python', 'graphic design', 'public speaking', 'data analysis', 'writing'];

async function popular(field, limit) {
  const rows = await User.aggregate([
    { $match: { status: ACCOUNT_STATUS.ACTIVE } },
    { $unwind: `$${field}` },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => r._id);
}

const merge = (...lists) => {
  const seen = new Map();
  for (const item of lists.flat()) {
    const key = item.toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
};

export async function options(_req, res) {
  const [interests, skills, programmes] = await Promise.all([
    popular('interests', 30),
    popular('skills', 30),
    User.distinct('programme', { status: ACCOUNT_STATUS.ACTIVE, programme: { $nin: [null, ''] } }),
  ]);

  res.json({
    goals: CONNECTION_GOALS,
    prompts: PROFILE_PROMPTS,
    programmes: merge(DEFAULT_PROGRAMMES, programmes).sort((a, b) => a.localeCompare(b)),
    interests: merge(interests, DEFAULT_INTERESTS),
    skills: merge(skills, DEFAULT_SKILLS),
  });
}
