import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './Components/Navbar/Navbar';
import Footer from './Components/Footer/Footer';
import Shop from './Pages/Shop';
import ProductCatalog from './Pages/ProductCatalog';
import Product from './Pages/Product';
import Cart from './Pages/Cart';
import Checkout from './Pages/Checkout';
import LoginSignup from './Pages/LoginSignup';
import PickupStations from './Pages/PickupStations';
import HowItWorks from './Pages/HowItWorks';
import AccountLayout from './Pages/Account/AccountLayout';
import Orders from './Pages/Account/Orders';
import OrderDetail from './Pages/Account/OrderDetail';
import Addresses from './Pages/Account/Addresses';
import Notifications from './Pages/Account/Notifications';
import { useAuth } from './Context/AuthContext';

// Protected Route Guard for Customer Account & Checkout
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '5rem', textAlign: 'center' }}>
        <div className="um-spinner" style={{ margin: '0 auto' }} />
        <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>Checking authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
};

function AppRoutes() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';

  return (
    <div className="um-app">
      {!isAuthPage && <Navbar />}
      <main className="um-main">
        <Routes>
          {/* Public customer routes */}
          <Route path="/" element={<Shop />} />
          <Route path="/catalog" element={<ProductCatalog />} />
          <Route path="/product/:productId" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/pickup-stations" element={<PickupStations />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/login" element={<LoginSignup />} />

          {/* Checkout (requires customer auth) */}
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />

          {/* Account nested area (requires customer auth) */}
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/account/orders" replace />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isAuthPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
