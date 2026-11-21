import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { UPLOADS_DIR, BACKEND_ROOT } from './config/paths.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { usersRouter, matchesRouter, metaRouter } from './routes/users.js';
import { connectionsRouter, communitiesRouter, postsRouter } from './routes/social.js';
import conversationRoutes from './routes/messages.js';
import reportRoutes from './routes/reports.js';
import searchRoutes from './routes/search.js';
import listingRoutes from './routes/listings.js';
import notificationRoutes from './routes/notifications.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  // Behind a proxy or tunnel (TRUST_PROXY=1), use the visitor's real IP for rate limits.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  // Uploaded profile photos. Names are random-ish and never reused, so they can be cached for a long time.
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/communities', communitiesRouter);
  app.use('/api/posts', postsRouter);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  // SERVE_CLIENT=true: serve the built React app from frontend/dist, so the whole
  // platform runs on one address (used for demos and simple deployments).
  const clientDir = join(BACKEND_ROOT, '..', 'frontend', 'dist');
  if (process.env.SERVE_CLIENT === 'true' && existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.use('/assets', express.static(join(clientDir, 'assets'), { maxAge: '1y', immutable: true }));
    // Any other non-API page loads the app, which handles the route itself.
    app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (_req, res) => res.sendFile(join(clientDir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
