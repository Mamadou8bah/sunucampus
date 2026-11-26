import mongoose from 'mongoose';

export const COMMUNITY_STATUS = Object.freeze({
  PENDING: 'pending', // waiting for admin approval
  ACTIVE: 'active',
  REJECTED: 'rejected',
  ARCHIVED: 'archived', // read-only
});

export const COMMUNITY_CATEGORIES = Object.freeze([
  'technology',
  'entrepreneurship',
  'sports',
  'research',
  'photography',
  'arts',
  'academic',
  'culture',
  'volunteering',
  'other',
]);

export const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const membershipDay = () => new Date().toISOString().slice(0, 10);

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true },
    category: { type: String, enum: COMMUNITY_CATEGORIES, required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    memberCount: { type: Number, default: 0 },
    membershipChanges: { type: mongoose.Schema.Types.Mixed, select: false },
    status: { type: String, enum: Object.values(COMMUNITY_STATUS), default: COMMUNITY_STATUS.PENDING, index: true },
    statusReason: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

communitySchema.index({ members: 1 });
communitySchema.index({ memberCount: -1 });

communitySchema.methods.isMember = function isMember(userId) {
  return this.members.some((m) => m.equals(userId));
};

communitySchema.methods.isModerator = function isModerator(userId) {
  return this.moderators.some((m) => m.equals(userId));
};

communitySchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.members; // can be large; use memberCount and the members endpoint
    delete ret.membershipChanges;
    return ret;
  },
});

export const Community = mongoose.model('Community', communitySchema);
