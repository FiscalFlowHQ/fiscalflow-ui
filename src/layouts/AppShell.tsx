import { Link, Outlet } from "react-router-dom";

export default function AppShell() {
  return (
    <div className="shell">
      <header className="shell-topbar">
        <Link to="/" className="shell-brand">
          Fiscal<span>Flow</span>
        </Link>
        <nav className="shell-nav">
          <Link to="/settings" className="shell-nav-link">
            Settings
          </Link>
        </nav>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
