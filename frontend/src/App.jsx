import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
const Layout = lazy(() => import("./Layout.jsx"));
const Home = lazy(() => import("./pages/Home.jsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.jsx"));
const MailAction = lazy(() => import("./pages/MailAction.jsx"));
const PublicRoomDemo = lazy(() => import("./pages/PublicRoomDemo.jsx"));
const Admin = lazy(() => import("./pages/InstallationAdmin.jsx"));
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
const PracticeSetup = lazy(() => import("./pages/PracticeSetup.jsx"));
const PracticeGuide = lazy(() => import("./pages/PracticeGuide.jsx"));
const PreviewWorkbench = lazy(() => import("./pages/PreviewWorkbench.jsx"));
const ReportExample = lazy(() => import("./pages/ReportExample.jsx"));
const RoomHub = lazy(() => import("./pages/RoomHub.jsx"));
const Room = lazy(() => import("./pages/Room.jsx"));
const GuidedDemo = lazy(() => import("./pages/GuidedDemo.jsx"));
const ModeGuide = lazy(() => import("./pages/ModeGuide.jsx"));
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
const Stories = lazy(() => import("./pages/Stories.jsx"));
const StoryStudio = lazy(() => import("./pages/StoryStudio.jsx"));
const StoryModeration = lazy(() => import("./pages/StoryModeration.jsx"));
const Feed = lazy(() => import("./pages/Feed.jsx"));
const PostDetail = lazy(() => import("./pages/PostDetail.jsx"));
const SavedPosts = lazy(() => import("./pages/SavedPosts.jsx"));
const Collections = lazy(() => import("./pages/Collections.jsx"));
const CollectionDetail = lazy(() => import("./pages/CollectionDetail.jsx"));
const SocialNotifications = lazy(() => import("./pages/SocialNotifications.jsx"));
const SocialModeration = lazy(() => import("./pages/SocialModeration.jsx"));
const BusinessLanding = lazy(() => import("./business/BusinessLanding.jsx"));
const BusinessLayout = lazy(() => import("./business/BusinessLayout.jsx"));
const BusinessGate = lazy(() => import("./business/BusinessLayout.jsx").then(m => ({default:m.BusinessGate})));
const BusinessWorkspaces = lazy(() => import("./business/BusinessLayout.jsx").then(m => ({default:m.BusinessWorkspaces})));
const BusinessCreate = lazy(() => import("./business/BusinessLayout.jsx").then(m => ({default:m.BusinessCreate})));
const BusinessSectionPage = lazy(() => import("./business/BusinessLayout.jsx").then(m => ({default:m.BusinessSectionPage})));
const BusinessDemo = lazy(() => import("./business/BusinessDemo.jsx"));
const BusinessSessionBoundary = lazy(() => import("./business/BusinessSessionBoundary.jsx"));
const Serials = lazy(() => import("./pages/Serials.jsx"));
const SerialStory = lazy(() => import("./pages/SerialStory.jsx"));
const SerialPlayer = lazy(() => import("./pages/SerialPlayer.jsx"));
const GameLab = lazy(() => import("./pages/GameLab.jsx"));
const RedZone = lazy(() => import("./pages/RedZone.jsx"));
const RedZonePlayer = lazy(() => import("./pages/RedZonePlayer.jsx"));

function Gate({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="p-10 text-slate-400">Арена загружается…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`} replace />;
  if (user.is_admin) return <Navigate to="/admin" replace />;
  return children;
}

function PublicAuthRedirect({ mode }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("auth", mode);
  return <Navigate to={{ pathname: "/", search: `?${params.toString()}` }} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/stories" element={<StoryModeration />} />
      <Route path="/admin/social" element={<SocialModeration />} />
      <Route path="/business" element={<BusinessLanding />} />
      <Route path="/business/login" element={<BusinessLanding />} />
      <Route path="/business/register" element={<BusinessLanding />} />
      <Route path="/business/demo" element={<BusinessDemo />} />
      <Route element={<BusinessGate><Outlet /></BusinessGate>}>
        <Route path="/business/workspaces" element={<BusinessWorkspaces />} />
        <Route path="/business/onboarding" element={<BusinessCreate />} />
        <Route path="/business/:companyId" element={<BusinessLayout />}>
          <Route index element={<BusinessSectionPage />} />
          <Route path="play/:id" element={<BusinessSessionBoundary><Play /></BusinessSessionBoundary>} />
          <Route path="dialogue/:id" element={<BusinessSessionBoundary><FreePractice /></BusinessSessionBoundary>} />
          <Route path="guide" element={<PracticeGuide />} />
          <Route path="report/:id" element={<BusinessSessionBoundary><Report /></BusinessSessionBoundary>} />
          <Route path="report/:id/ideal-dialogue" element={<BusinessSessionBoundary><IdealDialogue /></BusinessSessionBoundary>} />
          <Route path="room/:id" element={<Room />} />
          <Route path=":section" element={<BusinessSectionPage />} />
        </Route>
      </Route>
      <Route path="/login" element={<PublicAuthRedirect mode="login" />} />
      <Route path="/register" element={<PublicAuthRedirect mode="register" />} />
      <Route path="/forgot-password" element={<MailAction kind="forgot" />} />
      <Route path="/reset-password" element={<MailAction kind="reset" />} />
      <Route path="/verify-email" element={<MailAction kind="verify" />} />
      <Route path="/demo/rooms" element={<PublicRoomDemo />} />
      <Route path="/preview" element={<Suspense fallback={<p>Открываем примеры…</p>}><PreviewWorkbench /></Suspense>} />
      <Route path="/report/example" element={<Suspense fallback={<p>Открываем пример…</p>}><ReportExample /></Suspense>} />
      <Route
        element={
          <Gate>
            <Layout />
          </Gate>
        }
      >
        <Route path="/app" element={<Home />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/feed/post/:postId" element={<PostDetail />} />
        <Route path="/feed/notifications" element={<SocialNotifications />} />
        <Route path="/saved" element={<SavedPosts />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:collectionId" element={<CollectionDetail />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/stories/new" element={<StoryStudio />} />
        <Route path="/stories/:storyId/edit" element={<StoryStudio />} />
        <Route path="/stories/:storyId" element={<Stories />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/scenarios" element={<Scenarios />} />
        <Route path="/serials" element={<Serials />} />
        <Route path="/serials/play/:runId" element={<SerialPlayer />} />
        <Route path="/serials/:storyId" element={<SerialStory />} />
        <Route path="/lab" element={<GameLab />} />
        <Route path="/lab/red-zone" element={<RedZone />} />
        <Route path="/lab/red-zone/play/:runId" element={<RedZonePlayer />} />
        <Route path="/scenarios/demo" element={<ModeGuide mode="scenarios" />} />
        <Route path="/play/:id" element={<Play />} />
        <Route path="/report/:id" element={<Report />} />
        <Route path="/report/:id/ideal-dialogue" element={<IdealDialogue />} />
        <Route path="/history" element={<Navigate to="/analytics" replace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/company" element={<Company />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/collection" element={<Navigate to="/profile/edit" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<ProfileEditor />} />
        <Route path="/people" element={<Friends />} />
        <Route path="/people/:username" element={<PublicProfile />} />
        <Route path="/learn" element={<LearnHub />} />
        <Route path="/learn/:programId" element={<TrainingSession />} />
        <Route path="/learn/:programId/errors" element={<ErrorTraining />} />
        <Route path="/training" element={<TrainingHub />} />
        <Route path="/training/demo" element={<ModeGuide mode="training" />} />
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
        <Route path="/ai/demo" element={<ModeGuide mode="ai" />} />
        <Route path="/ai/job" element={<JobPractice />} />
        <Route path="/ai/prepare" element={<PracticeSetup />} />
        <Route path="/ai/guide" element={<PracticeGuide />} />
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
      <Suspense fallback={<div className="p-10 text-slate-300" role="status">Загружаем страницу…</div>}><AppRoutes /></Suspense>
    </AuthProvider>
  );
}
