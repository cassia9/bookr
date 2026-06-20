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
import SettingsPage from './pages/admin/SettingsPage'
import ClientsPage from './pages/admin/ClientsPage'
// import DashboardPage from './pages/admin/DashboardPage'
// import SettingsPage from './pages/admin/SettingsPage'
// InviteMemberPage 已整合為 SettingsPage 內的 Modal
// MembersPage 已整合進 SettingsPage
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
            <Route path="clients" element={<ClientsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="members" element={<Navigate to="/admin/settings" replace />} />
            <Route path="invite-member" element={<Navigate to="/admin/settings" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
