import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { ROUTES } from "./config/routes";
import CommunityPage from "./pages/CommunityPage";
import CreatePage from "./pages/CreatePage";
import LibraryPage from "./pages/LibraryPage";
import ProfilePage from "./pages/ProfilePage";
import PromptsPage from "./pages/PromptsPage";

/** 将页面功能装配到带全局导航的路由壳中。 */
export default function App() {
  return <Routes>
    <Route element={<AppShell />}>
      <Route path={ROUTES.create} element={<CreatePage />} />
      <Route path={ROUTES.prompts} element={<PromptsPage />} />
      <Route path={ROUTES.library} element={<LibraryPage />} />
      <Route path={ROUTES.community} element={<CommunityPage />} />
      <Route path={ROUTES.profile} element={<ProfilePage />} />
      <Route path="/" element={<Navigate to={ROUTES.create} replace />} />
    </Route></Routes>;
}
