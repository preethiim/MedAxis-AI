import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import PatientDashboard from './pages/PatientDashboard';
import { DoctorDashboard, HospitalDashboard } from './pages/Dashboards';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import ThemeToggle from './components/ThemeToggle';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { LandingPage } from './pages/LandingPage';

function App() {
  return (
    <Router>
      <ThemeToggle />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Public Legal Routes */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />

        {/* Protected Routes */}
        <Route path="/dashboard/patient" element={
          <ProtectedRoute allowedRoles={['patient']}>
            <PatientDashboard />
          </ProtectedRoute>
        } />

        <Route path="/dashboard/doctor" element={
          <ProtectedRoute allowedRoles={['doctor']}>
            <DoctorDashboard />
          </ProtectedRoute>
        } />

        <Route path="/dashboard/hospital" element={
          <ProtectedRoute allowedRoles={['hospital']}>
            <HospitalDashboard />
          </ProtectedRoute>
        } />

        <Route path="/dashboard/superadmin" element={
          <ProtectedRoute allowedRoles={['superadmin']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        {/* Public Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Default route fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
