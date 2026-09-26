import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./Layout.jsx";
import { AuthProvider, useAuth } from "./auth.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
const Admin = lazy(() => import("./pages/Admin.jsx"));
const History = lazy(() => import("./pages/History.jsx"));
const Play = lazy(() => import("./pages/Play.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const ProfileEditor = lazy(() => import("./pages/ProfileEditor.jsx"));
const Report = lazy(() => import("./pages/Report.jsx"));
const IdealDialogue = lazy(() => import("./pages/IdealDialogue.jsx"));
const Setup = lazy(() => import("./pages/Setup.jsx"));
const Shop = lazy(() => import("./pages/Shop.jsx"));
const LearnHub = lazy(() => import("./pages/LearnHub.jsx"));
const TrainingSession = lazy(() => import("./pages/TrainingSession.jsx"));
const ErrorTraining = lazy(() => import("./pages/ErrorTraining.jsx"));
const TrainingHub = lazy(() => import("./pages/TrainingHub.jsx"));
const FreePractice = lazy(() => import("./pages/FreePractice.jsx"));
const AiMode = lazy(() => import("./pages/AiMode.jsx"));
const JobPractice = lazy(() => import("./pages/JobPractice.jsx"));
const RoomHub = lazy(() => import("./pages/RoomHub.jsx"));
const Room = lazy(() => import("./pages/Room.jsx"));
const GuidedDemo = lazy(() => import("./pages/GuidedDemo.jsx"));
const LearningPath = lazy(() => import("./pages/LearningPath.jsx"));
const PathBriefing = lazy(() => import("./pages/PathBriefing.jsx"));
const PathSession = lazy(() => import("./pages/PathSession.jsx"));
const PathReport = lazy(() => import("./pages/PathReport.jsx"));
const PathReview = lazy(() => import("./pages/PathReview.jsx"));
const ChapterSummary = lazy(() => import("./pages/ChapterSummary.jsx"));
const ChapterPath = lazy(() => import("./pages/ChapterPath.jsx"));
const PublicProfile = lazy(() => import("./pages/PublicProfile.jsx"));
const Friends = lazy(() => import("./pages/Friends.jsx"));
const TheoryCatalog = lazy(() => import("./pages/Theory.jsx").then(({ TheoryCatalog }) => ({ default: TheoryCatalog })));
const TheoryLesson = lazy(() => import("./pages/Theory.jsx").then(({ TheoryLesson }) => ({ default: TheoryLesson })));
const Scenarios = lazy(() => import("./pages/Scenarios.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const DesignGallery = lazy(() => import("./design/DesignGallery.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const Company = lazy(() => import("./pages/Company.jsx"));

function Gate({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="p-10 text-slate-400">Арена загружается…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Gate>
            <Layout />
          </Gate>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/scenarios" element={<Scenarios />} />
        <Route path="/play/:id" element={<Play />} />
        <Route path="/report/:id" element={<Report />} />
        <Route path="/report/:id/ideal-dialogue" element={<IdealDialogue />} />
        <Route path="/history" element={<History />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/company" element={<Company />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/collection" element={<Navigate to="/profile/edit" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<ProfileEditor />} />
        <Route path="/people" element={<Friends />} />
        <Route path="/people/:username" element={<PublicProfile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/learn" element={<LearnHub />} />
        <Route path="/learn/:programId" element={<TrainingSession />} />
        <Route path="/learn/:programId/errors" element={<ErrorTraining />} />
        <Route path="/training" element={<TrainingHub />} />
        <Route path="/theory" element={<TheoryCatalog />} />
        <Route path="/theory/:lessonId" element={<TheoryLesson />} />
        <Route path="/training/path" element={<LearningPath />} />
        <Route path="/training/path/chapter/:chapterId" element={<ChapterPath />} />
        <Route path="/training/path/level/:levelId" element={<PathBriefing />} />
        <Route path="/training/path/attempt/:attemptId" element={<PathSession />} />
        <Route path="/training/path/attempt/:attemptId/report" element={<PathReport />} />
        <Route path="/training/path/attempt/:attemptId/review" element={<PathReview />} />
        <Route path="/training/path/chapter/:chapterId/summary" element={<ChapterSummary />} />
        <Route path="/training/tree" element={<Navigate to="/training/path" replace />} />
        <Route path="/training/tree/:professionId" element={<Navigate to="/training/path" replace />} />
        <Route path="/training/node/:nodeId" element={<Navigate to="/training/path" replace />} />
        <Route path="/training/node/:nodeId/play" element={<Navigate to="/training/path" replace />} />
        <Route path="/practice" element={<FreePractice />} />
        <Route path="/ai" element={<AiMode />} />
        <Route path="/ai/job" element={<JobPractice />} />
        <Route path="/rooms" element={<RoomHub />} />
        <Route path="/rooms/demo" element={<GuidedDemo />} />
        <Route path="/room/:id" element={<Room />} />
        <Route path="/training/errors" element={<ErrorTraining />} />
        {import.meta.env.DEV && <Route path="/__design-v4" element={<DesignGallery />} />}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
