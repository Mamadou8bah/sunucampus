import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setupDB, clearDB, teardownDB, api, createUser, bearer } from './helpers.js';
import { Listing } from '../src/models/Listing.js';
import { User } from '../src/models/User.js';

before(setupDB);
after(teardownDB);
beforeEach(clearDB);

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f6a0000000049454e44ae426082',
  'hex',
);
const uploadPath = (url) => join(process.env.UPLOADS_DIR, url.replace('/uploads/', ''));

function sell(token, fields, photos = 0) {
  let req = api().post('/api/listings').set(bearer(token));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
  for (let i = 0; i < photos; i += 1) req = req.attach('photos', PNG, `p${i}.png`);
  return req;
}

const calculator = { title: 'Casio fx-991 calculator', price: 750, category: 'stationery', condition: 'like_new', location: 'Kanifing campus' };

describe('marketplace listings', () => {
  it('creates a listing with photos and shows it to other students', async () => {
    const seller = await createUser({ name: 'Seller' });
    const buyer = await createUser();
    const res = await sell(seller.token, calculator, 2);
    assert.equal(res.status, 201);
    assert.equal(res.body.listing.photos.length, 2);
    assert.equal(res.body.listing.price, 750);
    assert.equal(res.body.listing.seller.name, 'Seller');
    assert.ok(existsSync(uploadPath(res.body.listing.photos[0])));

    const list = await api().get('/api/listings').set(bearer(buyer.token));
    assert.equal(list.body.total, 1);
    assert.equal(list.body.listings[0].isMine, false);

    const one = await api().get(`/api/listings/${res.body.listing.id}`).set(bearer(buyer.token));
    assert.equal(one.body.listing.title, calculator.title);
  });

  it('validates fields and photo files', async () => {
    const { token } = await createUser();
    assert.equal((await sell(token, { title: 'x', price: 10, category: 'books' })).status, 400);
    assert.equal((await sell(token, { ...calculator, price: -5 })).status, 400);
    assert.equal((await sell(token, { ...calculator, category: 'cars' })).status, 400);
    const fake = await api().post('/api/listings').set(bearer(token)).field('title', 'Phone').field('price', '100').field('category', 'phones').attach('photos', Buffer.from('not an image'), 'a.png');
    assert.equal(fake.status, 400);
    const five = await sell(token, calculator, 5);
    assert.equal(five.status, 400);
  });

  it('filters by search, category and price, and sorts by price', async () => {
    const seller = await createUser();
    await sell(seller.token, calculator);
    await sell(seller.token, { title: 'Intro to Economics textbook', price: 300, category: 'books' });
    await sell(seller.token, { title: 'Samsung A14 phone', price: 4500, category: 'phones' });

    const titles = async (query) => (await api().get('/api/listings').query(query).set(bearer(seller.token))).body.listings.map((l) => l.title);
    assert.deepEqual(await titles({ q: 'textbook' }), ['Intro to Economics textbook']);
    assert.deepEqual(await titles({ category: 'phones' }), ['Samsung A14 phone']);
    assert.deepEqual(await titles({ maxPrice: 800, sort: 'price_asc' }), ['Intro to Economics textbook', 'Casio fx-991 calculator']);
  });

  it('lets only the seller edit, swap photos and mark as sold', async () => {
    const seller = await createUser();
    const other = await createUser();
    const { body } = await sell(seller.token, calculator, 2);
    const id = body.listing.id;
    const [keep, drop] = body.listing.photos;

    assert.equal((await api().patch(`/api/listings/${id}`).set(bearer(other.token)).send({ price: 1 })).status, 403);

    const edit = await api()
      .patch(`/api/listings/${id}`)
      .set(bearer(seller.token))
      .field('price', '600')
      .field('keepPhotos', JSON.stringify([keep]))
      .attach('photos', PNG, 'new.png');
    assert.equal(edit.status, 200);
    assert.equal(edit.body.listing.price, 600);
    assert.equal(edit.body.listing.photos.length, 2);
    assert.equal(edit.body.listing.photos[0], keep);
    assert.equal(existsSync(uploadPath(drop)), false);

    const sold = await api().patch(`/api/listings/${id}`).set(bearer(seller.token)).send({ status: 'sold' });
    assert.equal(sold.body.listing.status, 'sold');
    assert.ok(sold.body.listing.soldAt);
    // Sold items leave the marketplace but stay in the seller's own list.
    assert.equal((await api().get('/api/listings').set(bearer(other.token))).body.total, 0);
    assert.equal((await api().get('/api/listings?mine=true').set(bearer(seller.token))).body.total, 1);
  });

  it('deletes a listing, and hides listings from suspended sellers', async () => {
    const seller = await createUser();
    const viewer = await createUser();
    const a = await sell(seller.token, calculator);
    await sell(seller.token, { title: 'Desk fan', price: 900, category: 'hostel' });

    assert.equal((await api().delete(`/api/listings/${a.body.listing.id}`).set(bearer(viewer.token))).status, 403);
    assert.equal((await api().delete(`/api/listings/${a.body.listing.id}`).set(bearer(seller.token))).status, 204);
    assert.equal((await api().get('/api/listings').set(bearer(viewer.token))).body.total, 1);

    await User.updateOne({ _id: seller.user.id }, { status: 'suspended' });
    assert.equal((await api().get('/api/listings').set(bearer(viewer.token))).body.total, 0);
  });
});

describe('messaging a seller', () => {
  it('lets a buyer message a seller about a listing without being connected', async () => {
    const seller = await createUser({ name: 'Seller' });
    const buyer = await createUser();
    const { body } = await sell(seller.token, calculator, 1);

    // Without a listing, strangers still can't message each other.
    assert.equal((await api().post('/api/conversations').set(bearer(buyer.token)).send({ userId: seller.user.id })).status, 403);

    const open = await api().post('/api/conversations').set(bearer(buyer.token)).send({ userId: seller.user.id, listingId: body.listing.id });
    assert.equal(open.status, 200);
    assert.equal(open.body.conversation.listing.title, calculator.title);

    const id = open.body.conversation.id;
    assert.equal((await api().post(`/api/conversations/${id}/messages`).set(bearer(buyer.token)).send({ content: 'Is it still available?' })).status, 201);
    // The seller can reply in the same chat.
    assert.equal((await api().post(`/api/conversations/${id}/messages`).set(bearer(seller.token)).send({ content: 'Yes!' })).status, 201);
  });

  it('refuses a listing that is sold or belongs to someone else', async () => {
    const seller = await createUser();
    const someoneElse = await createUser();
    const buyer = await createUser();
    const { body } = await sell(seller.token, calculator);
    const wrongSeller = await api().post('/api/conversations').set(bearer(buyer.token)).send({ userId: someoneElse.user.id, listingId: body.listing.id });
    assert.equal(wrongSeller.status, 400);

    await Listing.updateOne({ _id: body.listing.id }, { status: 'sold' });
    const sold = await api().post('/api/conversations').set(bearer(buyer.token)).send({ userId: seller.user.id, listingId: body.listing.id });
    assert.equal(sold.status, 400);
  });
});

describe('reporting and moderating listings', () => {
  it('reports a listing and lets an admin remove it from the queue', async () => {
    const seller = await createUser();
    const reporter = await createUser();
    const admin = await createUser({ role: 'admin' });
    const { body } = await sell(seller.token, calculator);

    assert.equal((await api().post('/api/reports').set(bearer(seller.token)).send({ targetType: 'listing', targetId: body.listing.id, reason: 'spam' })).status, 400);
    const report = await api().post('/api/reports').set(bearer(reporter.token)).send({ targetType: 'listing', targetId: body.listing.id, reason: 'spam' });
    assert.equal(report.status, 201);

    const queue = await api().get('/api/admin/reports?status=open').set(bearer(admin.token));
    assert.match(queue.body.reports[0].target.name, /Casio/);

    const resolved = await api().patch(`/api/admin/reports/${report.body.report.id}`).set(bearer(admin.token)).send({ status: 'resolved', action: 'content_removed' });
    assert.equal(resolved.status, 200);
    assert.equal((await Listing.findById(body.listing.id)).status, 'removed');
  });

  it('counts marketplace activity in the statistics', async () => {
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const a = await sell(seller.token, calculator);
    await sell(seller.token, { title: 'Desk fan', price: 900, category: 'hostel' });
    await api().patch(`/api/listings/${a.body.listing.id}`).set(bearer(seller.token)).send({ status: 'sold' });

    const today = new Date().toISOString().slice(0, 10);
    const res = await api().get('/api/admin/stats').query({ from: today, to: today, section: 'marketplace' }).set(bearer(admin.token));
    assert.equal(res.body.marketplace.created, 2);
    assert.equal(res.body.marketplace.sold, 1);
    assert.equal(res.body.marketplace.activeNow, 1);
    assert.equal(res.body.marketplace.sellThroughRate, 50);
  });
});
