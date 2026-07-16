import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import HomePage from "./pages/HomePage";
import ReviewPage from "./pages/ReviewPage";
import RunPage from "./pages/RunPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * FiscalFlow FDD workspace routes + Excel Auditor review (full-bleed, outside AppShell).
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/run/:threadId" element={<RunPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/review/:auditId" element={<ReviewPage />} />
      <Route path="/upload" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
