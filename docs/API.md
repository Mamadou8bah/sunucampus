# SunuCampus API

Base URL: `/api`. Request and response bodies are JSON. Authenticated endpoints need
`Authorization: Bearer <token>`, using the token returned by register or login.

**Access levels:** *Public* = no token. *User* = any active account. *Admin* = role `admin`.
Community moderation endpoints also allow that community's moderators.

**Errors** always look like this (`details` appears only for validation errors):

```json
{ "error": { "message": "Validation failed", "details": [{ "field": "email", "message": "Enter a valid email address" }] } }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input, or an action that isn't allowed in the current state |
| 401 | Missing, invalid or expired token |
| 403 | Signed in, but the role or relationship doesn't allow this (also returned for suspended or banned accounts) |
| 404 | Not found, or hidden from you |
| 409 | Conflict, such as a duplicate email or community name, or a request already answered |
| 429 | Rate limited (login, registration, reports) |

Every user object returned by the API includes `isVerified`, which drives the blue tick.

Paginated lists accept `page` and `limit` and return `{ page, limit, total, totalPages }` alongside the items.

## Authentication

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | Public | `name, email, password` | Always creates a `student`. Optional email domain restriction via `ALLOWED_EMAIL_DOMAINS`. |
| POST | `/auth/login` | Public | `email, password` | Returns `{ token, user }`. Suspended and banned accounts get 403 with the reason. |
| GET | `/auth/me` | User | | Current user |
| PATCH | `/auth/password` | User | `currentPassword, newPassword` | Returns a fresh token; older tokens stop working. |
| POST | `/auth/verify-email/request` | User | `email?` | Sends a 6-digit code to a UTG address (default: the account email). Codes expire after 10 minutes. Limited to 6 requests per hour. Without SMTP settings outside production, the response includes `devCode`. |
| POST | `/auth/verify-email/confirm` | User | `code` | Confirms the code (5 attempts). The address becomes the account email and the student gets the blue tick (`isVerified: true`). |

## Profiles, discovery and matching

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| PATCH | `/users/me` | User | `name, programme, yearOfStudy, bio, avatarUrl, interests[], skills[], goals[]` | Empty values clear a field. Role, status and email can't be changed here. |
| GET | `/users` | User | `q, programme, year, interests, skills, goal, page, limit` | `interests`/`skills` are comma-separated (all must match). Includes `matchScore` when the viewer's profile is complete. |
| GET | `/users/:id` | User | | Public profile, plus `match { score, reasons }` and `relation { status, connectionId }`. |
| GET | `/matches` | User | `limit` | `{ matches: [{ user, score, reasons, shared }], profileIncomplete }`. See [MATCHING.md](MATCHING.md). |
| GET | `/matches/people` | User | `limit` | `{ recommendations: [{ user, score, reasons }] }`. Graph and profile recommendations, including for new accounts. |
| GET | `/meta/options` | User | | Suggested programmes, interests, skills and the goal list. |

`relation.status` is one of `none`, `connected`, `pending_outgoing`, `pending_incoming`, or `declined` (shown only to
the student whose request was declined, for 30 days).

## Connections

| Method | Endpoint | Access | Body | Notes |
|---|---|---|---|---|
| GET | `/connections` | User | | Accepted connections |
| GET | `/connections/requests` | User | | `{ incoming, outgoing }` pending requests |
| POST | `/connections` | User | `recipientId, source` | `source`: `match`, `discover` or `profile`. If the other student already asked you, this accepts their request. |
| PATCH | `/connections/:id` | Recipient | `action: accept or reject` | |
| DELETE | `/connections/:id` | Either student | | Cancels your pending request, or removes a connection |

## Posts and comments

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/posts` | User | `community, author, page, limit` | With no filter: the campus feed (campus-wide posts plus your communities' posts). |
| GET | `/posts` | User | `scope=friends, page, limit` | Newest visible posts from the viewer and their active accepted connections. |
| GET | `/posts` | User | `rank=relevant` or `rank=trending`, `window=today\|week`, `snapshot?, page, limit` | Ranked public feed. Reuse the response's viewer-specific `snapshot` and page size for later pages. A stale or incompatible snapshot returns 409. |
| POST | `/posts` | User | `content, community?` | Posting in a community requires membership. |
| GET | `/posts/:id` | User | | |
| DELETE | `/posts/:id` | Author, community moderator, admin | | Soft delete |
| PATCH | `/posts/:id/pin` | Community moderator, admin | `pinned` | Community posts only |
| PUT | `/posts/:id/like` | User | | Idempotent |
| DELETE | `/posts/:id/like` | User | | Idempotent |
| PUT | `/posts/:id/dismiss` | User | | Hides the post from both ranked modes for the signed-in user. Returns 204. |
| GET | `/posts/:id/comments` | User | | |
| POST | `/posts/:id/comments` | User | `content` | |
| DELETE | `/posts/:id/comments/:commentId` | Author, community moderator, admin | | |

Each post includes `likedByMe`, `isAuthor`, `canDelete` and `canPin` for the current user.

Ranked responses include first-page `highlights` and per-page `evaluation` counts (`served`, `uniqueAuthors`, `discovery`).
Ordinary feed requests, profile posts and community posts retain their original chronological or pinned ordering.

The profile update accepts `discoverable` and `rankingExcludedUsers` (up to 200 user IDs). Turning discovery off removes the account from people search, graph suggestions and goal-based matches. Exclusions apply in either direction to those surfaces and the ranked feeds. Direct profiles, messaging and connection permissions use their existing rules.

## Communities

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/communities` | User | `q, category, mine, page, limit` | Active communities. `mine=true` also includes your pending ones. |
| POST | `/communities` | User | `name, category, description?` | Created as `pending` until an admin approves it (admins' own are active immediately). |
| GET | `/communities/:idOrSlug` | User | | Includes `isMember`, `canModerate` and moderators |
| PATCH | `/communities/:id` | Community moderator, admin | `description, category` | |
| POST | `/communities/:id/join` | User | | Active communities only |
| POST | `/communities/:id/leave` | Member | | The only moderator must appoint another one first |
| GET | `/communities/:id/members` | User | | |
| DELETE | `/communities/:id/members/:userId` | Community moderator, admin | | Removes a member and updates the count. Demote a moderator before removing them. Removed members can rejoin active communities. |
| POST | `/communities/:id/moderators` | Community moderator, admin | `userId` | The new moderator must be a member |
| DELETE | `/communities/:id/moderators/:userId` | Community moderator, admin | | At least one moderator must remain |

Categories: `technology, entrepreneurship, sports, research, photography, arts, academic, culture, volunteering, other`.

## Messaging

Only connected students can message each other. Administrators cannot read conversations.

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/conversations` | User | | Your conversations with last message and `unreadCount` |
| GET | `/conversations/unread` | User | | `{ unread }` total, for the nav badge |
| POST | `/conversations` | User | `userId` | Opens or creates the conversation with a connection |
| GET | `/conversations/:id/messages` | Participant | `before, limit` | Oldest to newest, with `hasMore`. `before` is the id of the oldest message already loaded. |
| POST | `/conversations/:id/messages` | Participant | `content` | Also pushed over Socket.IO |
| POST | `/conversations/:id/read` | Participant | | Marks the other student's messages as read |

### Socket.IO events

Connect to the same origin with `io({ auth: { token } })`. Invalid tokens and inactive accounts are refused.

| Direction | Event | Payload |
|---|---|---|
| Server → client | `message:new` | `{ id, conversation, sender, content, createdAt, readAt }` |
| Server → client | `conversation:read` | `{ conversationId, readAt, byMe? }` |
| Server → client | `typing` | `{ conversationId, userId, isTyping }` |
| Client → server | `typing` | `{ conversationId, isTyping }` (relayed only to the other participant) |
| Server → client | `notification` | `{ notification, unread }` (see Notifications) |

## Marketplace

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/listings` | User | `q, category, minPrice, maxPrice, sort, mine, page, limit` | Active listings (`mine=true`: your active and sold ones). `sort`: `newest`, `price_asc`, `price_desc`. Listings from suspended sellers are hidden. |
| POST | `/listings` | User | multipart: `title, price, category, condition?, location?, description?`, up to 4 `photos` | Photos are checked by content (JPG, PNG, WebP, at most 3 MB each). |
| GET | `/listings/:id` | User | | With up to 4 more active items from the same seller |
| PATCH | `/listings/:id` | Seller | multipart or JSON: any field, `status` (`active`/`sold`), `keepPhotos` (JSON list), new `photos` | |
| DELETE | `/listings/:id` | Seller, admin | | |

To contact a seller, `POST /conversations` with `{ userId, listingId }`. This works without a connection while the listing is active, and the chat shows the item.

## Search

| Method | Endpoint | Access | Query | Notes |
|---|---|---|---|---|
| GET | `/search` | User | `q, type (all, people, communities, posts), limit` | Returns `{ people, communities, posts }`. Never includes admins, inactive accounts or unapproved communities. |

## Notifications

| Method | Endpoint | Access | Body / query | Notes |
|---|---|---|---|---|
| GET | `/notifications` | User | `before, limit` | Newest first. `before` is the `nextCursor` from the previous page. Returns `{ notifications, unread, nextCursor }`. |
| GET | `/notifications/unread` | User | | `{ unread }` |
| POST | `/notifications/read` | User | `ids?` | Marks the given notifications as read, or all of them without `ids` |

Types: `like` (grouped per post, with `actors` and `actorCount`), `comment`, `connection_request`, `connection_accepted`,
`community_approved`, `community_rejected`, `content_moderated` (an admin hid or removed your post, comment or listing; `subject`
and `text` say what and why) and `warning` (an admin's warning in `text`). You are never notified about your own actions.

## Content reports

| Method | Endpoint | Access | Body | Notes |
|---|---|---|---|---|
| POST | `/reports` | User | `targetType, targetId, reason, details?` | `targetType`: `post, comment, community, user, listing`. `reason`: `spam, harassment, inappropriate, misinformation, impersonation, other`. Repeat reports by the same student are not duplicated. |

## Administration (admin only)

| Method | Endpoint | Body / query | Notes |
|---|---|---|---|
| GET | `/admin/overview` | | Headline counts, newest users, recent visible posts, newest communities, recent admin actions |
| GET | `/admin/users` | `q, role, status, page, limit` | |
| GET | `/admin/users/:id` | | |
| POST | `/admin/users/:id/verify` | | Manually verifies a student account and records the action in the audit log. |
| PATCH | `/admin/users/:id/role` | `role` | You can't remove your own admin role, or the last admin's |
| PATCH | `/admin/users/:id/status` | `status, reason?` | `active, suspended, banned`. Disconnects the user's live sessions. |
| POST | `/admin/users/:id/warn` | `message, targetType?, targetId?` | Formal warning: counted on the account (`warningCount`), recorded in the audit log and sent to the student as a notification. Admins can't be warned. |
| GET | `/admin/reports` | `status, targetType, page, limit` | Each report includes a preview of the target and how many open reports it has |
| PATCH | `/admin/reports/:id` | `status, action, note?` | `status`: `resolved` or `dismissed`. `action`: `none, content_hidden, content_removed, user_warned, user_suspended, user_banned, community_archived`. `user_warned` sends `note` as the warning, or a standard message based on the report reason. Closes every open report on the same item. |
| GET | `/admin/posts` | `status, reported, q, page, limit` | `reported=true` shows only posts with open reports |
| PATCH | `/admin/posts/:id/status` | `status, reason?` | `visible, hidden, removed` |
| PATCH | `/admin/comments/:id/status` | `status, reason?` | |
| GET | `/admin/communities` | `status, q, page, limit` | |
| PATCH | `/admin/communities/:id/status` | `status, reason?` | `active` (approve), `rejected`, `archived`. Approving promotes the creator to moderator. |
| GET | `/admin/audit-logs` | `page, limit` | |
| GET | `/admin/stats` | `from, to, interval, section` | See below |
| GET | `/admin/stats/export` | same | CSV download, recorded in the audit log |

### Statistics

`from` and `to` are `YYYY-MM-DD` (default: the last 30 days, with `to` inclusive), with a range of at most two years.
`interval` is `day`, `week` or `month` (chosen automatically when omitted). `section` limits the response to one of
`users, engagement, connections, communities, messaging, moderation, popular` (default: all).

| Section | Contents |
|---|---|
| `users` | total, new in range, active in the last day/week/month, profile completion rate, by role, status, programme and year, registrations over time |
| `engagement` | posts, comments, likes, students posting, posts and comments over time, top posts, most active students |
| `connections` | requests sent, accepted, rejected, pending, acceptance rate, average connections per student, requests by source, share and accepted count from smart matching, requests over time |
| `communities` | totals by status and category, created in range, largest, fastest-growing by recorded net membership gains, most active by posts |
| `messaging` | message count, active conversations, students messaging, average per conversation, messages over time (counts only) |
| `moderation` | reports received, resolved, dismissed, open, average hours to resolve, by reason, content type and action, posts moderated, suspended and banned accounts, reports over time |
| `popular` | top interests, skills and connection goals |

Every time series has one entry per period, including zeros: `[{ date: "2026-11-01", count: 4 }, ...]`.
