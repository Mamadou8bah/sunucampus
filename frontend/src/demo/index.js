// Entry point of the in-browser backend for the frontend-only demo (VITE_STATIC_DEMO=true).
// Each module registers its routes with core.register when imported.
import './routes/auth-users.js';
import './routes/social.js';
import './routes/messaging.js';
import './routes/admin.js';

export { handle, resetDemo, downloadText } from './core.js';
export { createDemoSocket } from './socket.js';
