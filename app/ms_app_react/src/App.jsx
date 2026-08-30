import { Navigate, Route, Routes } from "react-router-dom";
import { useState } from "react";
import AppShell from "./components/AppShell";
import { ROUTES } from "./config/routes";
import CommunityPage from "./pages/CommunityPage";
import CreatePage from "./pages/CreatePage";
import LibraryPage from "./pages/LibraryPage";
import ProfilePage from "./pages/ProfilePage";
import PromptsPage from "./pages/PromptsPage";
import LoginPage from "./pages/LoginPage";

function readUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-user")); } catch { return null; }
}

/** 将页面功能装配到带全局导航的路由壳中。 */
export default function App() {
  const [user, setUser] = useState(readUser);
  return <Routes>
    <Route path={ROUTES.login} element={<LoginPage onLogin={setUser} />} />
    <Route element={user ? <AppShell onLogout={() => setUser(null)} /> : <Navigate to={ROUTES.login} replace />}>
      <Route path={ROUTES.create} element={<CreatePage />} />
      <Route path={ROUTES.prompts} element={<PromptsPage />} />
      <Route path={ROUTES.library} element={<LibraryPage />} />
      <Route path={ROUTES.community} element={<CommunityPage />} />
      <Route path={ROUTES.profile} element={<ProfilePage />} />
      <Route path="/" element={<Navigate to={ROUTES.create} replace />} />
    </Route></Routes>;
}
