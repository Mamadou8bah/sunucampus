export const MARKET_CATEGORIES = {
  books: 'Books',
  electronics: 'Electronics',
  phones: 'Phones',
  fashion: 'Fashion',
  hostel: 'Hostel and room',
  stationery: 'Stationery',
  services: 'Services',
  other: 'Other',
};

export const CONDITIONS = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
};

// Suggestions only; sellers can type any meeting point.
export const PICKUP_SUGGESTIONS = ['Kanifing campus', 'Brikama campus', 'Faraba Banta campus', 'MDI Road campus', 'Library entrance', 'Can deliver'];

const nf = new Intl.NumberFormat('en-GB');

/** "D1,500", or "Free" for zero. */
export const formatPrice = (price) => (price === 0 ? 'Free' : `D${nf.format(price)}`);
