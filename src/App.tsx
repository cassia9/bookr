import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { SnackbarProvider } from './components/ui/Snackbar'
import LoginPage from './pages/LoginPage'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AdminLayout from './components/layout/AdminLayout'
import BookingManagement from './pages/admin/BookingManagement'
import PractitionerManagement from './pages/admin/PractitionerManagement'
import ServicesPage from './pages/admin/ServicesPage'
import ComponentsPage from './pages/admin/ComponentsPage'
// import ClientsPage from './pages/admin/ClientsPage'
// import DashboardPage from './pages/admin/DashboardPage'
// import SettingsPage from './pages/admin/SettingsPage'
// import InviteMemberPage from './pages/admin/InviteMemberPage'
// import MembersPage from './pages/admin/MembersPage'
import AcceptInvitationPage from './pages/auth/AcceptInvitationPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SnackbarProvider />
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
            <Route index element={<Navigate to="bookings" replace />} />
            <Route path="bookings" element={<BookingManagement />} />
            <Route path="practitioners" element={<PractitionerManagement />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="components" element={<ComponentsPage />} />
            {/* <Route path="practitioners" element={<PractitionerManagement />} />
            <Route path="calendar" element={<Navigate to="/admin/bookings" replace />} />
            <Route path="gantt" element={<Navigate to="/admin/bookings" replace />} />
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
            } /> */}
          </Route>

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
