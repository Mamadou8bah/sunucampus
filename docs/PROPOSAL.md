# SunuCampus — Project Proposal (Revised)

**The University of The Gambia**
School of Information Technology & Communications
*Advanced Application Development & Advanced Programming Skills*

**SunuCampus: A Smart Campus Social and Networking Platform**
Submitted by: Mamadou Bah | Matriculation No.: 22326004

> **Revision note:** This version includes the additions the supervisor requested:
> role-based authorization, an administrative dashboard (user management, post and community moderation, platform oversight) and a reporting module with platform usage statistics.

---

## 1. Problem Statement

University life goes beyond lectures and assignments. Students benefit from friendships, study partnerships, professional networking, mentorship, collaboration and campus communities. However, many interact mainly with people within their existing classes, programmes or friendship groups.

This makes it difficult to discover students who share similar interests, possess useful skills or are working towards similar goals. A student seeking a project partner with web development skills may struggle to find one, even when suitable students are in another programme or year. New students may also find it difficult to meet people, identify study partners or join communities that match their interests.

Existing social media platforms support communication, but are not specifically designed to help students discover and build meaningful connections within their university community. They also give the institution no way to moderate content, keep the community safe or understand how students are engaging.

## 2. Proposed Solution

SunuCampus will be a university-focused social and networking web application that helps students discover, connect and interact with other students on campus.

Students will create profiles containing their programme, year of study, interests, skills and connection goals. These goals may include friendship, study partnerships, professional networking, project collaboration and mentorship.

A smart matching system will recommend relevant students based on shared interests, skills, academic background and connection goals. Students will also be able to discover others manually, establish connections, communicate privately, share posts and participate in interest-based campus communities.

To keep the platform safe and well-managed, SunuCampus will use **role-based authorization** to separate what students, community moderators and administrators can do. Administrators will have an **administrative dashboard** for managing users, moderating posts and communities and overseeing platform activity, along with a **reporting module** that presents platform usage statistics.

The platform will provide a dedicated, well-moderated digital space for students to meet people beyond their immediate circles and develop meaningful academic, professional and social relationships.

## 3. Objectives

The main objectives of SunuCampus are to:

- Provide a dedicated platform for social and professional interaction among university students.
- Help students discover others with similar interests, skills and goals.
- Recommend potentially relevant connections through smart matching.
- Enable students to find study partners, project collaborators, friends and networking opportunities.
- Encourage interaction across programmes and years of study.
- Provide spaces for shared interests and campus activities.
- Enforce role-based access so each type of user can perform only the actions appropriate to their role.
- Give administrators the tools to manage users, moderate content and communities, and keep the platform safe.
- Provide usage statistics and reports that show how the platform is being used and support decision-making.

## 4. Key Features

### 4.1 Student Features

- **Student Profiles:** Students will create profiles containing academic information, interests, skills, a short biography and the types of connections they want to make.
- **Smart Matching:** The application will calculate compatibility using common interests, skills, programme, year of study and connection goals, then recommend potentially relevant student connections.
- **Student Discovery:** Students will search and filter profiles by programme, interests, skills and networking goals.
- **Connections:** Users will send, accept or reject connection requests and maintain a network within the platform.
- **Private Messaging:** Connected students will communicate directly through the platform.
- **Campus Feed:** Students will create posts and interact with other students' content through likes and comments.
- **Communities:** Students will join groups around shared interests, including technology, entrepreneurship, sports, research, photography and other campus activities.
- **Content Reporting:** Students will be able to flag posts, comments, communities or profiles that are inappropriate, abusive or spam, sending them to the moderation queue.

### 4.2 Role-Based Authorization

Every account will have a role, and the backend will check that role on every protected request. The frontend will also show or hide features by role, but the server remains the authority.

| Role | Description | Key permissions |
|---|---|---|
| **Student** | Default role for all registered students | Manage own profile; discover and match; connect; message connections; post, like and comment; join communities and create them; report content |
| **Community Moderator** | Student who creates or is appointed to manage a community | All student permissions, plus: edit community details; approve or remove members; remove posts within their community; pin announcements |
| **Administrator** | Platform staff responsible for oversight | All permissions, plus: access the admin dashboard; manage all users and roles; moderate any post, comment or community; review reports; view and export usage statistics |

Implementation approach:

- Authentication with **JSON Web Tokens (JWT)**. The user's ID and role are included in the signed token, and passwords are hashed with **bcrypt**.
- Express middleware (`authenticate`, `authorize(...roles)`) protects routes, for example `authorize('admin')` on all `/api/admin/*` endpoints.
- Ownership checks ensure users can only edit or delete their own content unless their role allows otherwise (for example, a moderator within their community or an administrator anywhere).
- Suspended or banned accounts are blocked at login and on every authenticated request.

### 4.3 Administrative Dashboard

A separate, admin-only section of the React application providing:

- **User Management:** Search, filter and view all users; view profile details and activity; change a user's role (for example, promote a student to administrator); suspend, reactivate or ban accounts; verify student accounts.
- **Post Moderation:** Review posts and comments, especially reported ones; hide, restore or permanently delete content; issue a warning to the author.
- **Community Moderation:** Review, approve or reject newly created communities; edit or archive communities; assign or remove community moderators; remove communities that violate guidelines.
- **Reports Queue:** View every user-submitted report with its reason, the reported content and the reporter. Resolve or dismiss each report, with the action taken recorded.
- **Platform Oversight:** An activity overview showing recent sign-ups, posts, new communities and open reports, plus an **audit log** recording every administrative action (who did what, to what, and when) for accountability.

### 4.4 Reporting Module (Usage Statistics)

The reporting module will aggregate data with MongoDB aggregation pipelines and present it as charts and tables on the admin dashboard:

- **User statistics:** Total users, new registrations over time (daily/weekly/monthly), active users (daily and monthly active users), and the breakdown of users by programme, year of study and role.
- **Engagement statistics:** Number of posts, comments and likes over time; most active users; most popular posts.
- **Connection statistics:** Connection requests sent, accepted and rejected; acceptance rate; average connections per user; how many connections came from smart-match recommendations.
- **Community statistics:** Total communities, the largest and fastest-growing communities, and posting activity per community.
- **Messaging statistics:** Message volume over time (counts only; administrators will not be able to read message content).
- **Moderation statistics:** Reports received, resolved and pending; average resolution time; most common report reasons; suspended accounts.
- **Popular interests and skills:** The interests, skills and connection goals students select most often.
- **Filtering and export:** Filter every report by date range, and export reports to **CSV** (and printable PDF) for university records.

## 5. Target Users

The primary users will be students of The University of The Gambia. SunuCampus will particularly benefit students seeking to expand their social circles, find study partners, meet others with similar interests, collaborate on projects, participate in campus communities or build professional networks while at university.

Secondary users will be **administrators**, such as student affairs staff or designated platform managers, who will use the administrative dashboard and reporting module to moderate content, manage accounts and understand platform engagement. **Community moderators** will be students who manage individual communities.

## 6. Technology Stack

SunuCampus will be developed using the MERN stack:

- **MongoDB** will store user accounts and roles, student profiles, interests, connections, posts, comments, communities, messages, content reports, audit logs and other application data.
- **Express.js** will provide the REST API between the frontend and backend, including authentication, role-based authorization middleware, profile management, connections, posts, communities, messaging, administration and reporting endpoints.
- **React.js** will power the user interface, including profile pages, discovery, match recommendations, the campus feed, communities, messaging and the admin dashboard with role-protected routes.
- **Node.js** will provide the backend runtime for application logic, authentication, matching calculations, statistics aggregation and communication with MongoDB.

Supporting libraries:

- **Socket.IO** (WebSocket-based) for real-time messaging and notifications alongside the REST API.
- **JWT** and **bcrypt** for authentication and password security.
- **Mongoose** for data modelling and validation.
- **Recharts** (or Chart.js) for statistics charts in the reporting module.

The matching feature will initially use a **weighted scoring algorithm** based on profile information (for example, weighting shared connection goals, shared interests, complementary skills, the same programme and a similar year of study). This approach provides personalised recommendations without requiring a complex machine-learning model, keeping implementation practical within the development period.

### 6.1 High-Level Data Model

| Collection | Purpose | Key fields |
|---|---|---|
| `users` | Accounts and profiles | name, email, passwordHash, **role** (`student` / `moderator` / `admin`), **status** (`active` / `suspended` / `banned`), programme, year, bio, interests, skills, goals, lastActiveAt |
| `connections` | Connection requests and links | requester, recipient, status (`pending` / `accepted` / `rejected`), source (`match` / `search`) |
| `posts` | Feed and community posts | author, community (optional), content, likes, status (`visible` / `hidden` / `removed`) |
| `comments` | Comments on posts | post, author, content, status |
| `communities` | Interest groups | name, category, description, creator, moderators, members, status (`pending` / `active` / `archived`) |
| `messages` | Private messages | conversation, sender, content, readAt |
| `reports` | User-submitted content reports | reporter, targetType, targetId, reason, status (`open` / `resolved` / `dismissed`), resolvedBy, action |
| `auditlogs` | Record of administrative actions | admin, action, targetType, targetId, details, timestamp |

### 6.2 API Overview

| Area | Example endpoints | Access |
|---|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` | Public |
| Profiles and discovery | `GET/PUT /api/users/me`, `GET /api/users?interest=&programme=` | Student+ |
| Matching | `GET /api/matches` | Student+ |
| Connections | `POST /api/connections`, `PATCH /api/connections/:id` | Student+ |
| Posts | `GET/POST /api/posts`, `POST /api/posts/:id/like`, `POST /api/posts/:id/comments` | Student+ |
| Communities | `GET/POST /api/communities`, `PATCH /api/communities/:id` | Student+ / Moderator |
| Messaging | `GET /api/conversations`, Socket.IO events | Student+ (connections only) |
| Content reports | `POST /api/reports` | Student+ |
| Admin | `/api/admin/users`, `/api/admin/posts`, `/api/admin/communities`, `/api/admin/reports`, `/api/admin/audit-logs` | Admin |
| Statistics | `/api/admin/stats/overview`, `/api/admin/stats/users`, `/api/admin/stats/engagement`, `/api/admin/stats/export` | Admin |

## 7. Development Plan

| Phase | Deliverables |
|---|---|
| 1. Foundation | Project setup, data models, registration and login, JWT and role-based authorization middleware |
| 2. Profiles and discovery | Student profiles, search and filters, weighted smart matching |
| 3. Social features | Connections, campus feed, likes and comments, communities |
| 4. Messaging | Real-time private messaging with Socket.IO |
| 5. Administration | Admin dashboard, user management, post and community moderation, reports queue, audit log |
| 6. Reporting | Usage statistics, charts, date filters, CSV and PDF export |
| 7. Testing and deployment | API and interface testing, security review, seed data, deployment and documentation |

## Conclusion

SunuCampus aims to make the university community more connected by helping students discover people they might otherwise never meet. Combining profiles, smart matching, networking, messaging, communities and social interaction will support friendships, academic collaboration and professional relationships across campus.

Role-based authorization, the administrative dashboard and the reporting module make the platform safe, accountable and manageable. Administrators can moderate content and manage users, and usage statistics show how students engage with the platform.

The project is designed to be achievable within the semester using the MERN stack, while offering technical depth through authentication and authorization, data modelling, recommendation logic, social connections, content interaction, real-time communication, content moderation and data aggregation for analytics.
