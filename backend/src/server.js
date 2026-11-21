import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { initSocket } from './realtime/socket.js';
import { seedAdmin } from '../scripts/seedAdmin.js';

async function start() {
  // USE_MEMORY_DB=true runs without installing MongoDB. Data is lost on restart.
  if (process.env.USE_MEMORY_DB === 'true') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    await connectDB(mongod.getUri('sunucampus'));
    console.log('Using in-memory MongoDB (data is not persisted)');
    await seedAdmin();
    if (process.env.SEED_DEMO === 'true') {
      const { seedDemo } = await import('../scripts/seedDemo.js');
      await seedDemo();
    }
  } else {
    await connectDB(env.mongoUri);
  }

  // One HTTP server carries both the REST API and the Socket.IO connection.
  const server = createServer(createApp());
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`SunuCampus API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
