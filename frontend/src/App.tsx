import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignConsole } from "./pages/CampaignConsole";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignConsole />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
