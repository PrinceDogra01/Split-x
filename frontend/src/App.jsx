import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import VerifyResetOtp from './pages/VerifyResetOtp';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import NewGroup from './pages/NewGroup';
import Profile from './pages/Profile';
import Activity from './pages/Activity';
import JoinGroup from './pages/JoinGroup';
import { isAuthenticated } from './utils/auth';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Toaster position="top-right" />
        {isAuthenticated() && <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />}
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated() ? <Navigate to="/dashboard" /> : <Login />}
          />
          <Route
            path="/register"
            element={isAuthenticated() ? <Navigate to="/dashboard" /> : <Register />}
          />
          {/* Alias route to match invite link requirement (/signup?ref=USER_ID) */}
          <Route
            path="/signup"
            element={isAuthenticated() ? <Navigate to="/dashboard" /> : <Register />}
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-reset-otp" element={<VerifyResetOtp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/accept" element={<AcceptInvite />} />
          <Route path="/join-group/:groupId" element={<JoinGroup />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/groups/new"
            element={
              <PrivateRoute>
                <NewGroup />
              </PrivateRoute>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <PrivateRoute>
                <Groups />
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/activity"
            element={
              <PrivateRoute>
                <Activity />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

