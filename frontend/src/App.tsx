import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignMapView } from "./pages/CampaignMapView";
import { CampaignConsoleRaw } from "./pages/CampaignConsoleRaw";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignMapView />} />
      <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
