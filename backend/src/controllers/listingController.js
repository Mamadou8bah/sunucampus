import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { User } from '../models/User.js';
import { ACCOUNT_STATUS, ROLES } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { deleteUpload, saveImage } from '../utils/images.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SELLER_FIELDS = 'name avatarUrl programme yearOfStudy emailVerifiedAt status';
const MAX_PHOTOS = 4;

const isAdmin = (user) => user.role === ROLES.ADMIN;
const isSeller = (listing, user) => (listing.seller._id ?? listing.seller).equals(user._id);

export function serializeListing(listing, viewer) {
  const s = listing.seller;
  const mine = isSeller(listing, viewer);
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    location: listing.location,
    photos: listing.photos,
    status: listing.status,
    createdAt: listing.createdAt,
    soldAt: listing.soldAt,
    seller: s?.name
      ? { id: s.id, name: s.name, avatarUrl: s.avatarUrl, programme: s.programme, yearOfStudy: s.yearOfStudy, isVerified: Boolean(s.emailVerifiedAt) }
      : null,
    isMine: mine,
    canManage: mine || isAdmin(viewer),
  };
}

/** Loads a listing the viewer may see: active and sold ones are public; others only to the seller and admins. */
async function loadListing(id, viewer) {
  const listing = await Listing.findById(id).populate('seller', SELLER_FIELDS);
  if (!listing) throw ApiError.notFound('Listing not found');
  const publicStatus = [LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD].includes(listing.status);
  const sellerActive = listing.seller?.status === ACCOUNT_STATUS.ACTIVE;
  if ((!publicStatus || !sellerActive) && !isSeller(listing, viewer) && !isAdmin(viewer)) throw ApiError.notFound('Listing not found');
  return listing;
}

export async function list(req, res) {
  const { q, category, minPrice, maxPrice, sort, mine, page, limit } = req.validated.query;
  const filter = {};
  if (mine === 'true') {
    filter.seller = req.user._id;
    filter.status = { $in: [LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD] };
  } else {
    filter.status = LISTING_STATUS.ACTIVE;
    // Listings from suspended or banned sellers are not shown.
    filter.seller = { $nin: await User.find({ status: { $ne: ACCOUNT_STATUS.ACTIVE } }).distinct('_id') };
  }
  if (category) filter.category = category;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }
  const order = { newest: { createdAt: -1 }, price_asc: { price: 1, createdAt: -1 }, price_desc: { price: -1, createdAt: -1 } }[sort];

  const [listings, total] = await Promise.all([
    Listing.find(filter).sort(order).skip((page - 1) * limit).limit(limit).populate('seller', SELLER_FIELDS),
    Listing.countDocuments(filter),
  ]);
  res.json({
    listings: listings.map((l) => serializeListing(l, req.user)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function get(req, res) {
  const listing = await loadListing(req.params.id, req.user);
  const more = await Listing.find({ seller: listing.seller._id, status: LISTING_STATUS.ACTIVE, _id: { $ne: listing._id } })
    .sort({ createdAt: -1 })
    .limit(4)
    .populate('seller', SELLER_FIELDS);
  res.json({ listing: serializeListing(listing, req.user), moreFromSeller: more.map((l) => serializeListing(l, req.user)) });
}

export async function create(req, res) {
  const files = req.files ?? [];
  const photos = [];
  for (const file of files.slice(0, MAX_PHOTOS)) photos.push(await saveImage(file, 'listings', req.user.id));
  const listing = await Listing.create({ ...req.body, seller: req.user._id, photos });
  await listing.populate('seller', SELLER_FIELDS);
  res.status(201).json({ listing: serializeListing(listing, req.user) });
}

/** Edits details, keeps some photos, adds new ones, or marks as sold / available. */
export async function update(req, res) {
  const listing = await loadListing(req.params.id, req.user);
  if (!isSeller(listing, req.user)) throw ApiError.forbidden('Only the seller can edit this listing');
  if (![LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD].includes(listing.status)) throw ApiError.badRequest('This listing can no longer be edited');

  const { keepPhotos, status, ...fields } = req.body;
  Object.assign(listing, fields);

  if (keepPhotos !== undefined || req.files?.length) {
    const keep = (keepPhotos ?? listing.photos).filter((url) => listing.photos.includes(url));
    const added = [];
    for (const file of req.files ?? []) added.push(await saveImage(file, 'listings', req.user.id));
    const next = [...keep, ...added];
    if (next.length > MAX_PHOTOS) throw ApiError.badRequest(`Add at most ${MAX_PHOTOS} photos`);
    for (const url of listing.photos) if (!next.includes(url)) await deleteUpload(url);
    listing.photos = next;
  }

  if (status && status !== listing.status) {
    listing.status = status;
    listing.soldAt = status === LISTING_STATUS.SOLD ? new Date() : undefined;
  }
  await listing.save();
  res.json({ listing: serializeListing(listing, req.user) });
}

export async function remove(req, res) {
  const listing = await loadListing(req.params.id, req.user);
  if (!isSeller(listing, req.user) && !isAdmin(req.user)) throw ApiError.forbidden('Only the seller can delete this listing');
  listing.status = LISTING_STATUS.REMOVED;
  if (!isSeller(listing, req.user)) listing.moderatedBy = req.user._id;
  await listing.save();
  res.status(204).end();
}
