import { Link, Outlet, useLocation } from "react-router-dom";
import { ToastProvider } from "../components/feedback/Toast";

export default function AppShell() {
  const location = useLocation();
  const settingsTo =
    location.pathname.startsWith("/run/")
      ? `/settings?return=${encodeURIComponent(location.pathname + location.search)}`
      : "/settings";

  return (
    <ToastProvider>
      <div className="shell">
        <header className="shell-topbar">
          <Link to="/" className="shell-brand">
            Fiscal<span>Flow</span>
          </Link>
          <nav className="shell-nav">
            <Link to={settingsTo} className="shell-nav-link">
              Settings
            </Link>
          </nav>
        </header>
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
