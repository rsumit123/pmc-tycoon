import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignMapView } from "./pages/CampaignMapView";
import { CampaignConsoleRaw } from "./pages/CampaignConsoleRaw";
import { ProcurementHub } from "./pages/ProcurementHub";
import { IntelInbox } from "./pages/IntelInbox";
import { OpsRoom } from "./pages/OpsRoom";
import { VignetteAAR } from "./pages/VignetteAAR";
import { DefenseWhitePaper } from "./pages/DefenseWhitePaper";
import { TurnReport } from "./pages/TurnReport";
import { HangarPage } from "./pages/HangarPage";
import { ArmoryPage } from "./pages/ArmoryPage";
import { CombatHistoryPage } from "./pages/CombatHistoryPage";
import { ToastStack } from "./components/primitives/ToastStack";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/campaign/:id" element={<CampaignMapView />} />
        <Route path="/campaign/:id/procurement" element={<ProcurementHub />} />
        <Route path="/campaign/:id/intel" element={<IntelInbox />} />
        <Route path="/campaign/:id/vignette/:vid" element={<OpsRoom />} />
        <Route path="/campaign/:id/vignette/:vid/aar" element={<VignetteAAR />} />
        <Route path="/campaign/:id/white-paper" element={<DefenseWhitePaper />} />
        <Route path="/campaign/:id/turn-report/:year/:quarter" element={<TurnReport />} />
        <Route path="/campaign/:id/hangar" element={<HangarPage />} />
        <Route path="/campaign/:id/armory" element={<ArmoryPage />} />
        <Route path="/campaign/:id/combat-history" element={<CombatHistoryPage />} />
        <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
    </>
  );
}
