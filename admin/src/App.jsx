import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/Login/LoginPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import OrdersPage from './pages/Orders/OrdersPage';
import OrderDetailPage from './pages/Orders/OrderDetailPage';
import ProductsPage from './pages/Products/ProductsPage';
import ProductFormPage from './pages/Products/ProductFormPage';
import CategoriesPage from './pages/Categories/CategoriesPage';
import InventoryPage from './pages/Inventory/InventoryPage';
import DeliveriesPage from './pages/Deliveries/DeliveriesPage';
import PaymentsPage from './pages/Payments/PaymentsPage';
import CustomersPage from './pages/Customers/CustomersPage';
import NotificationsPage from './pages/Notifications/NotificationsPage';
import MessagesPage from './pages/Messages/MessagesPage';
import ServiceRequestsPage from './pages/Services/ServiceRequestsPage';
import ServiceRequestDetailPage from './pages/Services/ServiceRequestDetailPage';
import ServicesCatalogPage from './pages/Services/ServicesCatalogPage';
import TechniciansPage from './pages/Services/TechniciansPage';
import SettingsPage from './pages/Settings/SettingsPage';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/orders': 'Orders',
  '/products': 'Products',
  '/categories': 'Categories',
  '/inventory': 'Inventory',
  '/deliveries': 'Deliveries',
  '/payments': 'Payments',
  '/customers': 'Customers',
  '/notifications': 'Notifications',
  '/messages': 'Customer Messages',
  '/service-requests': 'Service Bookings',
  '/services': 'Service Catalogue',
  '/technicians': 'Technicians',
  '/settings': 'Store Settings',
};

/** Blocked route while the session is being restored (prevents login flash). */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="auth-boot" role="status">
        <span className="auth-boot__spinner" aria-hidden="true" />
        Restoring session…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  const location = useLocation();
  const base = location.pathname.split('/')[1];
  const pageTitle = location.pathname.startsWith('/orders/')
    ? 'Order Detail'
    : location.pathname.startsWith('/service-requests/')
      ? 'Service Booking'
      : PAGE_TITLES[location.pathname] ||
      (base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Operations Console');

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminLayout pageTitle={pageTitle} />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:id" element={<ProductFormPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="deliveries" element={<DeliveriesPage />} />
        <Route path="service-requests" element={<ServiceRequestsPage />} />
        <Route path="service-requests/:id" element={<ServiceRequestDetailPage />} />
        <Route path="services" element={<ServicesCatalogPage />} />
        <Route path="technicians" element={<TechniciansPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="customers" element={<CustomersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
