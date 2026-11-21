import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

let mongod;

export async function setupDB() {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri('sunucampus-test'));
  await User.syncIndexes();
}

export async function clearDB() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function teardownDB() {
  await mongoose.disconnect();
  await mongod?.stop();
}

export const app = createApp();
export const api = () => request(app);

let counter = 0;

/** Creates a user directly in the database and returns it with a valid token. */
export async function createUser(overrides = {}) {
  counter += 1;
  const password = overrides.password ?? 'Password123';
  const user = await User.create({
    name: `User ${counter}`,
    email: `user${counter}@test.local`,
    ...overrides,
    password,
  });
  const res = await api().post('/api/auth/login').send({ email: user.email, password });
  return { user, token: res.body.token, password };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
