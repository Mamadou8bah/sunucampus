import mongoose from 'mongoose';
import { cleanJSON } from './plugins.js';

export const REPORT_TARGETS = Object.freeze(['post', 'comment', 'community', 'user', 'listing']);
export const REPORT_REASONS = Object.freeze(['spam', 'harassment', 'inappropriate', 'misinformation', 'impersonation', 'other']);
export const REPORT_STATUS = Object.freeze({ OPEN: 'open', RESOLVED: 'resolved', DISMISSED: 'dismissed' });

// What an admin did when resolving a report.
export const REPORT_ACTIONS = Object.freeze([
  'none',
  'content_hidden',
  'content_removed',
  'user_warned',
  'user_suspended',
  'user_banned',
  'community_archived',
]);

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: Object.values(REPORT_STATUS), default: REPORT_STATUS.OPEN, index: true },
    action: { type: String, enum: REPORT_ACTIONS },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ createdAt: -1 });
// One open report per student per item.
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: REPORT_STATUS.OPEN } },
);

cleanJSON(reportSchema);
export const Report = mongoose.model('Report', reportSchema);
