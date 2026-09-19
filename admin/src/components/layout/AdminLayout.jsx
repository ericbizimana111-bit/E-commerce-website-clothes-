import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './AdminLayout.css';

/**
 * Application shell: persistent sidebar on desktop, drawer on small screens.
 * The mobile drawer is closed by keying the content area on the pathname:
 * navigation remounts the shell body and the drawer state resets naturally,
 * with no setState-in-effect cascade.
 */
export default function AdminLayout({ pageTitle }) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="admin-shell" key={location.pathname}>
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
