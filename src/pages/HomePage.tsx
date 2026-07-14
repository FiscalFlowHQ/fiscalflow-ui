import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { checkHealth } from "../api/fiscalflow";

type HealthState = "checking" | "ok" | "down";

export default function HomePage() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await checkHealth();
        if (!cancelled) setHealth(res.status === "ok" ? "ok" : "down");
      } catch {
        if (!cancelled) setHealth("down");
      }
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel =
    health === "checking" ? "Checking backend…" : health === "ok" ? "Backend online" : "Backend offline";

  return (
    <div className="home">
      <div className="home-hero">
        <h1 className="home-title">FiscalFlow</h1>
        <p className="home-subtitle">Generate FDD documents from Excel databooks.</p>
        <div className="home-actions">
          <button type="button" className="btn-primary" disabled title="Available after session support (task 04)">
            New FDD run
          </button>
        </div>
        <div className={`health-dot health-dot--${health}`} role="status" aria-live="polite">
          <span className="health-dot__indicator" aria-hidden />
          <span>{statusLabel}</span>
        </div>
      </div>
      <p className="home-legacy">
        <Link to="/upload">Legacy Excel auditor</Link>
      </p>
    </div>
  );
}
