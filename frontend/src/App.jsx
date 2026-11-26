import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RequireAuth, GuestOnly } from './auth/RequireAuth.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Intro from './pages/Intro.jsx';
import Verify from './pages/Verify.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';
import Profile from './pages/Profile.jsx';
import EditProfile from './pages/EditProfile.jsx';
import Matches from './pages/Matches.jsx';
import Network from './pages/Network.jsx';
import Communities from './pages/Communities.jsx';
import Community from './pages/Community.jsx';
import Messages from './pages/Messages.jsx';
import SearchPage from './pages/SearchPage.jsx';
import Marketplace from './pages/Marketplace.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import PostDetail from './pages/PostDetail.jsx';
import Notifications from './pages/Notifications.jsx';
import ListingForm from './pages/ListingForm.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import AdminPosts from './pages/admin/AdminPosts.jsx';
import AdminCommunities from './pages/admin/AdminCommunities.jsx';
import AdminAuditLog from './pages/admin/AdminAuditLog.jsx';

const AdminStats = lazy(() => import('./pages/admin/AdminStats.jsx'));

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/intro" element={<Intro />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="welcome" element={<Onboarding />} />
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="matches" element={<Matches />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="market" element={<Marketplace />} />
          <Route path="market/new" element={<ListingForm />} />
          <Route path="market/:id" element={<ListingDetail />} />
          <Route path="post/:id" element={<PostDetail />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="market/:id/edit" element={<ListingForm />} />
          <Route path="discover" element={<Navigate to="/matches?tab=search" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="profile/verify" element={<Verify />} />
          <Route path="people/:id" element={<Profile />} />
          <Route path="network" element={<Network />} />
          <Route path="communities" element={<Communities />} />
          <Route path="c/:slug" element={<Community />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:id" element={<Messages />} />

          <Route path="admin" element={<RequireAuth roles={['admin']} />}>
            <Route element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="posts" element={<AdminPosts />} />
              <Route path="communities" element={<AdminCommunities />} />
              <Route path="statistics" element={<AdminStats />} />
              <Route path="audit-log" element={<AdminAuditLog />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
