import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './AdminLayout.css';

/**
 * Application shell: persistent sidebar on desktop, drawer on small screens.
 */
export default function AdminLayout({ pageTitle }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="admin-shell">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="admin-shell__main">
        <Topbar title={pageTitle} onMenuClick={() => setNavOpen(true)} />
        <main className="admin-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
