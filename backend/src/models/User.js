import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ROLE_LIST, ACCOUNT_STATUS, STATUS_LIST, CONNECTION_GOALS, PROFILE_PROMPTS } from '../config/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLE_LIST, default: ROLES.STUDENT, index: true },
    status: { type: String, enum: STATUS_LIST, default: ACCOUNT_STATUS.ACTIVE, index: true },
    statusReason: { type: String, trim: true, maxlength: 500 },
    // Formal warnings from administrators.
    warningCount: { type: Number, default: 0 },
    lastWarnedAt: { type: Date },

    // Profile (filled in during phase 2; present now so the model is stable).
    programme: { type: String, trim: true, maxlength: 120 },
    yearOfStudy: { type: Number, min: 1, max: 7 },
    bio: { type: String, trim: true, maxlength: 500 },
    interests: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    goals: { type: [String], enum: CONNECTION_GOALS, default: [] },
    avatarUrl: { type: String, trim: true },
    prompts: {
      type: [
        {
          _id: false,
          question: { type: String, enum: PROFILE_PROMPTS, required: true },
          answer: { type: String, trim: true, maxlength: 150, required: true },
        },
      ],
      default: [],
    },

    // Set when the student confirms a UTG email address; shown as the blue tick.
    emailVerifiedAt: { type: Date },
    emailVerification: {
      type: {
        _id: false,
        email: String,
        codeHash: String,
        expiresAt: Date,
        attempts: { type: Number, default: 0 },
      },
      select: false,
    },

    lastActiveAt: { type: Date },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Tokens issued before the last password change are rejected.
userSchema.methods.changedPasswordAfter = function changedPasswordAfter(tokenIssuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > tokenIssuedAtSeconds;
};

// Fields other students may see. Email, status and activity stay private.
const PUBLIC_FIELDS = ['name', 'role', 'programme', 'yearOfStudy', 'bio', 'interests', 'skills', 'goals', 'prompts', 'avatarUrl', 'createdAt'];

userSchema.virtual('isVerified').get(function isVerified() {
  return Boolean(this.emailVerifiedAt);
});

userSchema.methods.toPublicJSON = function toPublicJSON() {
  const out = { id: this.id, isVerified: this.isVerified };
  for (const field of PUBLIC_FIELDS) out[field] = this[field];
  return out;
};

userSchema.index({ interests: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ goals: 1 });
userSchema.index({ programme: 1, yearOfStudy: 1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    ret.isVerified = Boolean(ret.emailVerifiedAt);
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.emailVerification;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
