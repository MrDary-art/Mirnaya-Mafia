import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./Layout.jsx";
import { AuthProvider, useAuth } from "./auth.jsx";
import Admin from "./pages/Admin.jsx";
import History from "./pages/History.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Play from "./pages/Play.jsx";
import Profile from "./pages/Profile.jsx";
import Report from "./pages/Report.jsx";
import Setup from "./pages/Setup.jsx";
import Shop from "./pages/Shop.jsx";
import LearnHub from "./pages/LearnHub.jsx";
import TrainingSession from "./pages/TrainingSession.jsx";
import ErrorTraining from "./pages/ErrorTraining.jsx";
import TrainingHub from "./pages/TrainingHub.jsx";
import FreePractice from "./pages/FreePractice.jsx";
import AiMode from "./pages/AiMode.jsx";
import JobPractice from "./pages/JobPractice.jsx";
import RoomHub from "./pages/RoomHub.jsx";
import Room from "./pages/Room.jsx";
import GuidedDemo from "./pages/GuidedDemo.jsx";
import LearningPath from "./pages/LearningPath.jsx";
import PathBriefing from "./pages/PathBriefing.jsx";
import PathSession from "./pages/PathSession.jsx";
import PathReport from "./pages/PathReport.jsx";
import PathReview from "./pages/PathReview.jsx";
import ChapterSummary from "./pages/ChapterSummary.jsx";
import ChapterPath from "./pages/ChapterPath.jsx";
import PeopleSearch from "./pages/PeopleSearch.jsx";
import PublicProfile from "./pages/PublicProfile.jsx";
import Friends from "./pages/Friends.jsx";
import { TheoryCatalog, TheoryLesson } from "./pages/Theory.jsx";
import Scenarios from "./pages/Scenarios.jsx";

function Gate({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-10 text-slate-400">Арена загружается…</div>;
  if (!user) return <Navigate to="/login" replace />;
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
        <Route path="/history" element={<History />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/profile" element={<Profile />} />
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
