import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import { AuthContext, AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Register from './pages/Register';
import TicketDetail from './pages/TicketDetail';
import { TabManagerProvider } from './contexts/TabManagerContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const auth = useContext(AuthContext);
  if (!auth) {
    return <div>Yükleniyor...</div>;
  }
  if (auth.loading) {
    return <div className="flex items-center justify-center h-screen text-lg">Yükleniyor...</div>;
  }
  return auth.isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route 
            path="/ticket/:ticketId"
            element={
              <ProtectedRoute>
                <TicketDetail />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/*"
            element={
              <ProtectedRoute>
                <TabManagerProvider>
                  <Layout />
                </TabManagerProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;