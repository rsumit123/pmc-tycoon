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
import { PerformancePage } from "./pages/PerformancePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OpsScreen } from "./pages/OpsScreen";
import { StrikeAARPage } from "./pages/StrikeAARPage";
import { Login } from "./pages/Login";
import { ImageCredits } from "./pages/ImageCredits";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { AccountDeletion } from "./pages/AccountDeletion";
import { Glossary } from "./pages/Glossary";
import { ObjectivesPage } from "./pages/ObjectivesPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ToastStack } from "./components/primitives/ToastStack";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/credits" element={<ImageCredits />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/account-deletion" element={<AccountDeletion />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route element={<ProtectedRoute />}>
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
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
          <Route path="/campaign/:id/notifications" element={<NotificationsPage />} />
          <Route path="/campaign/:id/ops" element={<OpsScreen />} />
          <Route path="/campaign/:id/ops/strike/:sid" element={<StrikeAARPage />} />
          <Route path="/campaign/:id/objectives" element={<ObjectivesPage />} />
          <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastStack />
    </>
  );
}
