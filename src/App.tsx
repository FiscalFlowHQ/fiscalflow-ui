import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import HomePage from "./pages/HomePage";
import RunPage from "./pages/RunPage";
import SettingsPage from "./pages/SettingsPage";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/run/:threadId" element={<RunPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      {/* Legacy audit flow — parked until task 15; keep compiling */}
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/review/:auditId" element={<ReviewPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
