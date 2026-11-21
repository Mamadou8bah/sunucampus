import mongoose from 'mongoose';
import { cleanJSON } from './plugins.js';

export const LISTING_CATEGORIES = Object.freeze(['books', 'electronics', 'phones', 'fashion', 'hostel', 'stationery', 'services', 'other']);
export const LISTING_CONDITIONS = Object.freeze(['new', 'like_new', 'good', 'fair']);
export const LISTING_STATUS = Object.freeze({
  ACTIVE: 'active',
  SOLD: 'sold',
  HIDDEN: 'hidden', // hidden by an admin, can be restored
  REMOVED: 'removed', // deleted by the seller or an admin
});

const listingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1500 },
    // Whole dalasi; 0 means free.
    price: { type: Number, required: true, min: 0, max: 1_000_000 },
    category: { type: String, enum: LISTING_CATEGORIES, required: true, index: true },
    condition: { type: String, enum: LISTING_CONDITIONS, default: 'good' },
    location: { type: String, trim: true, maxlength: 80 },
    photos: { type: [String], default: [] },
    status: { type: String, enum: Object.values(LISTING_STATUS), default: LISTING_STATUS.ACTIVE, index: true },
    soldAt: { type: Date },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

listingSchema.index({ status: 1, createdAt: -1 });

cleanJSON(listingSchema);
export const Listing = mongoose.model('Listing', listingSchema);
