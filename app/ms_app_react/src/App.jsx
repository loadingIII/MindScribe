import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import AppShell from "./components/AppShell";
import { ROUTES } from "./config/routes";
import CommunityPage from "./pages/CommunityPage";
import CreatePage from "./pages/CreatePage";
import LibraryPage from "./pages/LibraryPage";
import ProfilePage from "./pages/ProfilePage";
import PromptsPage from "./pages/PromptsPage";
import LoginPage from "./pages/LoginPage";
import ImgsPromptPage from "./components/ImgsPromptPage/ImgsPromptPage";

function readUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-user")); } catch { return null; }
}

/** 将页面功能装配到带全局导航的路由壳中。 */
export default function App() {
  const [user, setUser] = useState(readUser);
  const [authChecked, setAuthChecked] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const invalidate = () => {
      localStorage.removeItem("mindscribe-user");
      if (active) { setUser(null); setAuthChecked(true); }
    };
    const showError = (event) => {
      setNotice(event.detail?.message || "请求失败，请稍后重试");
      window.setTimeout(() => setNotice(""), 3200);
    };
    window.addEventListener("mindscribe-auth-invalid", invalidate);
    window.addEventListener("mindscribe-api-error", showError);
    if (!user) { setAuthChecked(true); return () => { active = false; window.removeEventListener("mindscribe-auth-invalid", invalidate); window.removeEventListener("mindscribe-api-error", showError); }; }
    fetch("/auth/me", { credentials: "include" })
      .then((response) => {
        if (response.status === 401 || response.status === 403) { invalidate(); return null; }
        return response.ok ? response.json() : null;
      })
      .then((serverUser) => {
        if (!active || !serverUser) return;
        localStorage.setItem("mindscribe-user", JSON.stringify(serverUser));
        setUser(serverUser);
      })
      .catch(() => {})
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; window.removeEventListener("mindscribe-auth-invalid", invalidate); window.removeEventListener("mindscribe-api-error", showError); };
  }, []);

  if (!authChecked) return null;
  return <><Routes>
    <Route path={ROUTES.login} element={<LoginPage onLogin={setUser} />} />
    <Route element={user ? <AppShell onLogout={() => setUser(null)} /> : <Navigate to={ROUTES.login} replace />}>
      <Route path={ROUTES.create} element={<CreatePage />} />
      <Route path="/create/prompt-builder" element={<ImgsPromptPage />} />
      <Route path={ROUTES.prompts} element={<PromptsPage />} />
      <Route path={ROUTES.library} element={<LibraryPage />} />
      <Route path={ROUTES.community} element={<CommunityPage />} />
      <Route path={ROUTES.profile} element={<ProfilePage />} />
      <Route path="/" element={<Navigate to={ROUTES.create} replace />} />
    </Route></Routes>{notice && <aside className="global-notice" role="alert" aria-live="assertive"><span className="global-notice-icon"><AlertCircle size={18} /></span><div><b>需要处理一下</b><p>{notice}</p></div><button type="button" className="global-notice-close" onClick={() => setNotice("")} aria-label="关闭提示"><X size={16} /></button></aside>}</>;
}
