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
import LearnHub from "./pages/LearnHub.jsx";
import TrainingSession from "./pages/TrainingSession.jsx";
import ErrorTraining from "./pages/ErrorTraining.jsx";
import TrainingHub from "./pages/TrainingHub.jsx";
import SkillTree from "./pages/SkillTree.jsx";
import TrainingNode from "./pages/TrainingNode.jsx";
import TrainingExercise from "./pages/TrainingExercise.jsx";
import FreePractice from "./pages/FreePractice.jsx";

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
        <Route path="/play/:id" element={<Play />} />
        <Route path="/report/:id" element={<Report />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/learn" element={<LearnHub />} />
        <Route path="/learn/:programId" element={<TrainingSession />} />
        <Route path="/learn/:programId/errors" element={<ErrorTraining />} />
        <Route path="/training" element={<TrainingHub />} />
        <Route path="/training/tree" element={<SkillTree />} />
        <Route path="/training/tree/:professionId" element={<SkillTree />} />
        <Route path="/training/node/:nodeId" element={<TrainingNode />} />
        <Route path="/training/node/:nodeId/play" element={<TrainingExercise />} />
        <Route path="/practice" element={<FreePractice />} />
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
