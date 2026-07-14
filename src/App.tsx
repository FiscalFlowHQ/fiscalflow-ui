import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import HomePage from "./pages/HomePage";
import RunPage from "./pages/RunPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * FiscalFlow FDD workspace routes.
 * Legacy csv-fixer audit pages (`/upload`, `/review/:id`) are intentionally not served —
 * they called `/api/audits/*`, which exists in neither fiscalflow-ui nor fiscalflow-api.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/run/:threadId" element={<RunPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/upload" element={<Navigate to="/" replace />} />
      <Route path="/review/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
