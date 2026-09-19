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
  const pathname = location.pathname;

  // Close the mobile drawer whenever the route changes (skips the redundant
  // same-route render so the effect has no cascading same-path setState).
  useEffect(() => {
    setNavOpen((open) => (open ? false : open));
  }, [pathname]);

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
