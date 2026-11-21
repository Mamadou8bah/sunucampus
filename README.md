# SunuCampus

A smart campus social and networking platform for students of The University of The Gambia, built with the MERN stack
(MongoDB, Express, React, Node.js) and Socket.IO.

- [`docs/PROPOSAL.md`](docs/PROPOSAL.md): the project proposal, including the supervisor's requested additions
- [`docs/API.md`](docs/API.md): REST and real-time API reference
- [`docs/MATCHING.md`](docs/MATCHING.md): how the smart matching algorithm works
- [`docs/DESIGN.md`](docs/DESIGN.md): the mobile-first design, its research and its visual identity

The interface is designed as a **mobile app first**: bottom tab bar, swipeable match cards, bottom sheets and
full-screen chats. It can be installed to a phone's home screen, and on a desktop it switches to a side rail.

## Features

| Area | What it does |
|---|---|
| Accounts and roles | Registration, login with JWT, password change. Three roles (student, moderator, admin) enforced on every request. |
| Onboarding | A three-screen intro on first launch, then a five-step setup after sign-up (verify email, study, goals, interests, prompt) and a finish screen. |
| Verified students | Students confirm a UTG email (`@utg.edu.gm`) with a 6-digit code and get a blue tick next to their name everywhere. |
| Profiles | Programme, year, bio, photo, interests, skills, connection goals and up to three conversation prompts. |
| Smart matching | Weighted compatibility score with plain-language reasons ("Shared interests: football, music"). |
| Discovery | Search and filter students by programme, year, interest, skill and goal. |
| Connections | Send, accept, decline, cancel and remove connection requests. |
| Campus feed | Posts, likes and comments, plus posts from your communities. |
| Communities | Create (admin approval required), join, leave, post, pin, and moderate with community moderators. |
| Messaging | Real-time private messages between connections, with typing indicators, read receipts and unread badges. |
| Marketplace | Students list items and services with up to 4 photos, a price in dalasi, category, condition and pickup spot. Buyers browse, filter and message the seller directly (no connection needed for a listing). |
| Search | One search for people, communities and posts, with recent searches and trending interests. |
| Content reporting | Students report posts, comments, communities and profiles. |
| Admin dashboard | Overview, user management (roles, suspend, ban), reports queue, post and comment moderation, community approval, audit log. |
| Reporting module | Usage statistics for users, engagement, connections, communities, messaging, moderation and popular interests, with date ranges, charts, table views, CSV export and print-to-PDF. |

## Project status

| Phase | Status |
|---|---|
| 1. Foundation: data models, authentication, role-based authorization | Done |
| 2. Profiles, discovery, smart matching | Done |
| 3. Connections, campus feed, communities | Done |
| 4. Real-time messaging | Done |
| 5. Admin dashboard: users, reports queue, moderation, audit log | Done |
| 6. Reporting module: statistics, charts, CSV and PDF export | Done |
| 7. Testing and deployment | Automated API tests written; deployment not started |

## Structure

```
backend/
  src/config/        environment, database, roles
  src/models/        User, Connection, Community, Post, Comment, Conversation, Message, Report, AuditLog
  src/middleware/    authenticate, authorize(...roles), validate (zod), error handling
  src/controllers/   route handlers
  src/services/      matching helpers, permissions, connections, statistics, CSV
  src/realtime/      Socket.IO server
  src/routes/        /api/* routers
  scripts/           seedAdmin.js, seedDemo.js
  tests/             API tests (node:test + supertest + in-memory MongoDB)
frontend/
  src/auth/          AuthContext, route guards
  src/realtime/      SocketContext (live messages, unread badge)
  src/components/    shared UI, charts
  src/pages/         student pages and admin/*
docs/                proposal and documentation
```

## Running locally

Requires Node.js 20.6 or newer.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Then choose a database:

- **No MongoDB install (quickest):** in `.env` set `USE_MEMORY_DB=true`. Add `SEED_DEMO=true` to load 40 demo students
  with posts, communities, connections and messages. Data is lost when the server stops.
- **Real MongoDB:** set `MONGO_URI` to a local MongoDB or a MongoDB Atlas connection string, then run
  `npm run seed:admin` (creates the administrator from `.env`) and optionally `npm run seed:demo`.

Start the API and real-time server on http://localhost:5000:

```bash
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api and /socket.io to the backend
```

### 3. Sign in

- **Administrator:** the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env` (defaults: `admin@sunucampus.local` / `ChangeMe123`).
- **Demo students** (with `SEED_DEMO=true` or `npm run seed:demo`): any `@demo.sunucampus.local` address shown in
  the admin Users page, password `Password123`.
- Or register a new student account.

Change the default admin password before deploying anywhere public.

### Frontend-only demo (no server)

The frontend can run on its own with the demo data built in, so it can be hosted on any static host
(Netlify, Vercel, GitHub Pages, Cloudflare Pages):

```bash
cd frontend
npm run build:demo        # outputs frontend/dist
```

In this build every request goes to an in-browser copy of the API (`frontend/src/demo`): logins, profiles,
matching, posts, communities, messaging (demo students reply), the marketplace, notifications and the full
admin dashboard. Each visitor's changes are saved in their own browser; **Profile → Settings → Reset demo
data** starts over. The login screen offers a demo student and the admin dashboard.

- Host settings: base directory `frontend`, build command `npm run build:demo`, publish directory `dist`
  (`frontend/netlify.toml` and `frontend/vercel.json` already say this, including the rewrite every page needs).
- To refresh the built-in data after changing the database: `cd backend && npm run demo:export`
  (writes `frontend/src/demo/snapshot.json` and copies the photos to `frontend/public/uploads`).

### Sharing a demo link

The backend can serve the built app itself, so the whole platform runs on one address:

```bash
cd frontend && VITE_DEMO=true npm run build      # VITE_DEMO adds a "Try a demo account" button to the login screen
cd ../backend && PORT=5050 SERVE_CLIENT=true TRUST_PROXY=1 npm start
cloudflared tunnel --url http://localhost:5050   # prints a public https://….trycloudflare.com link
```

`TRUST_PROXY=1` makes rate limits use each visitor's real address instead of the tunnel's. The link works while this computer
and both commands are running, and changes each time the tunnel starts.

Demo data helpers: `npm run photos:more` downloads extra portraits for review, `npm run photos:assign` gives demo students
without a photo an unused one, and `npm run seed:notifications` rebuilds demo notifications from existing activity.

### Tests

```bash
cd backend
npm test
```

The first run downloads a MongoDB binary for the in-memory test database (about 800 MB, cached afterwards).

## Roles and authorization

| Role | How it is assigned | Can do |
|---|---|---|
| `student` | Every new registration (a role sent by the client is ignored) | All student features |
| `moderator` | Automatically when a student's community is approved or they are appointed moderator of one; or by an admin | Student features, plus moderating their own communities (edit, pin and remove posts and comments, appoint moderators) |
| `admin` | `npm run seed:admin`, or promoted by another admin | Everything, including the admin dashboard and reporting module |

How it is enforced:

- `authenticate` verifies the JWT and loads the user from the database on every request, so role changes and
  suspensions take effect immediately, even for tokens already issued. Suspended users' live sockets are disconnected.
- `authorize('admin')` guards every `/api/admin/*` route. React route guards only hide screens; the API is the authority.
- Ownership and community checks (`services/permissions.js`) decide who may edit or remove each post, comment and community.
- Changing a password invalidates all earlier tokens.
- An admin cannot demote or suspend themselves, and the last active admin cannot be removed.
- Administrators can see messaging **counts** in the statistics but cannot open anyone's conversations.
- Every administrative action is written to the audit log.

## Notes on the statistics

- "Active users" are based on each account's most recent activity (updated at most every five minutes), so they describe
  the current day, week and month rather than a historical range.
- Likes are not timestamped, so "likes" counts likes on posts created within the selected range.
- Time series fill empty periods with zero so quiet days are visible.
