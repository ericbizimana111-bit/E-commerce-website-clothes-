import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './Components/Navbar/Navbar';
import Footer from './Components/Footer/Footer';
import MobileNav from './Components/MobileNav/MobileNav';
import ScrollToTop from './Components/ui/ScrollToTop';
import { ToastProvider } from './Components/Toast/Toast';
import { RealtimeProvider } from './Context/RealtimeContext';
import Shop from './Pages/Shop';
import ProductCatalog from './Pages/ProductCatalog';
import Product from './Pages/Product';
import Cart from './Pages/Cart';
import Checkout from './Pages/Checkout';
import LoginSignup from './Pages/LoginSignup';
import HowItWorks from './Pages/HowItWorks';
import AccountLayout from './Pages/Account/AccountLayout';
import Orders from './Pages/Account/Orders';
import OrderDetail from './Pages/Account/OrderDetail';
import Addresses from './Pages/Account/Addresses';
import Notifications from './Pages/Account/Notifications';
import Messages from './Pages/Account/Messages';
import Services from './Pages/Services/Services';
import ServiceBooking from './Pages/Services/ServiceBooking';
import MyServiceRequests from './Pages/Services/MyServiceRequests';
import ServiceRequestDetail from './Pages/Services/ServiceRequestDetail';
import { useAuth } from './Context/AuthContext';
import { useLanguage } from './Context/LanguageContext';

// Protected route guard for the customer account area and checkout.
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="um-loading-box" role="status" style={{ padding: '5rem 1rem' }}>
        <div className="um-spinner" />
        <p>{t('loading')}</p>
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
    <div className={`um-app ${isAuthPage ? 'um-app--auth' : ''}`}>
      <ScrollToTop />
      {!isAuthPage && <Navbar />}
      {/* Keyed by path so each page fades in on navigation. */}
      <main className="um-main" id="main" key={location.pathname}>
        <div className="um-page">
          <Routes location={location}>
            {/* Public customer routes */}
            <Route path="/" element={<Shop />} />
            <Route path="/catalog" element={<ProductCatalog />} />
            <Route path="/product/:productId" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:slug" element={<ServiceBooking />} />
            {/* Pickup stations were retired: UgaMarket delivers every order. */}
            <Route path="/pickup-stations" element={<Navigate to="/how-it-works" replace />} />
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

            {/* Account area (requires customer auth) */}
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
              <Route path="messages" element={<Messages />} />
              <Route path="services" element={<MyServiceRequests />} />
              <Route path="services/:id" element={<ServiceRequestDetail />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {!isAuthPage && <Footer />}
      {!isAuthPage && <MobileNav />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ToastProvider>
        <RealtimeProvider>
          <AppRoutes />
        </RealtimeProvider>
      </ToastProvider>
    </Router>
  );
}

export default App;
