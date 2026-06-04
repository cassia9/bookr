import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AdminLayout from './components/layout/AdminLayout'
import LoginPage from './pages/LoginPage'
import CalendarPage from './pages/admin/CalendarPage'
import GanttPage from './pages/admin/GanttPage'
import ClientsPage from './pages/admin/ClientsPage'
import ServicesPage from './pages/admin/ServicesPage'
import DashboardPage from './pages/admin/DashboardPage'
import SettingsPage from './pages/admin/SettingsPage'
import InviteMemberPage from './pages/admin/InviteMemberPage'
import MembersPage from './pages/admin/MembersPage'
import AcceptInvitationPage from './pages/auth/AcceptInvitationPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="calendar" replace />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="gantt" element={<GanttPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="members" element={
              <ProtectedRoute adminOnly>
                <MembersPage />
              </ProtectedRoute>
            } />
            <Route path="invite-member" element={
              <ProtectedRoute adminOnly>
                <InviteMemberPage />
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute adminOnly>
                <SettingsPage />
              </ProtectedRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
