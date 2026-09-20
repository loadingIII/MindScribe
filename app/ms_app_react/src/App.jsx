import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import AppShell from "./components/AppShell";
import { ROUTES } from "./config/routes";
import { WORKSPACE_OWNER_KEY } from "./config/constants";
import { setActiveDraftUser } from "./utils/draftStorage";
import CreatePage from "./pages/CreatePage";
import ProfilePage from "./pages/ProfilePage";
import PromptsPage from "./pages/PromptsPage";
import LoginPage from "./pages/LoginPage";
import ImgsPromptPage from "./components/ImgsPromptPage/ImgsPromptPage";
import { useStore } from "./store/AppStore";

function readUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-user")); } catch { return null; }
}

/** 读取当前创作数据归属账号，用于判断是否发生了账号切换；null 表示从未记录。 */
function readOwner() {
  try { return localStorage.getItem(WORKSPACE_OWNER_KEY); } catch { return null; }
}

/** 将页面功能装配到带全局导航的路由壳中。 */
export default function App() {
  const [user, setUser] = useState(readUser);
  const [authChecked, setAuthChecked] = useState(false);
  const [notice, setNotice] = useState("");
  // 记录当前创作数据归属的账号 ID，用于检测账号切换并清空创作模块。
  const { resetWorkspace, refreshBalance } = useStore();
  const ownerId = user?.userId || user?.id || "";
  const ownerRef = useRef(readOwner());

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
        // 会话有效时同步一次积分余额，保证侧边栏与个人页展示真实数据。
        refreshBalance();
      })
      .catch(() => {})
      .finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; window.removeEventListener("mindscribe-auth-invalid", invalidate); window.removeEventListener("mindscribe-api-error", showError); };
  }, []);

  // 账号变化时同步归属标记并清空创作模块：退出登录、会话失效、换号登录都会经过这里。
  useEffect(() => {
    const previousOwner = ownerRef.current;
    // 归属与当前账号一致（含刷新后恢复正常）则无需清理。
    if (ownerId === previousOwner) return;
    ownerRef.current = ownerId;
    try {
      // 始终写入标记（登出写空串），以便区分"已记录登出"和"从未记录"。
      localStorage.setItem(WORKSPACE_OWNER_KEY, ownerId);
    } catch { /* 存储不可用时跳过标记，不影响清理流程。 */ }
    // 从未记录归属（如升级后首次刷新）时直接认领现有数据，避免误清已登录用户的工作台；
    // 其余归属变化一律重置创作模块。
    if (previousOwner !== null) resetWorkspace();
    // 重置会把草稿归属清空，这里最后把归属指向当前账号，保证草稿按账号分键。
    setActiveDraftUser(ownerId || null);
  }, [ownerId, resetWorkspace, refreshBalance]);

  if (!authChecked) return null;
  return <><Routes>
    <Route path={ROUTES.login} element={<LoginPage onLogin={setUser} />} />
    <Route element={user ? <AppShell onLogout={() => setUser(null)} /> : <Navigate to={ROUTES.login} replace />}>
      <Route path={ROUTES.create} element={<CreatePage />} />
      <Route path="/create/prompt-builder" element={<ImgsPromptPage />} />
      <Route path={ROUTES.prompts} element={<PromptsPage />} />
      <Route path="/library" element={<Navigate to={ROUTES.create} replace />} />
      <Route path="/community" element={<Navigate to={ROUTES.create} replace />} />
      <Route path={ROUTES.profile} element={<ProfilePage />} />
      <Route path="/" element={<Navigate to={ROUTES.create} replace />} />
    </Route></Routes>{notice && <aside className="global-notice" role="alert" aria-live="assertive"><span className="global-notice-icon"><AlertCircle size={18} /></span><div><b>需要处理一下</b><p>{notice}</p></div><button type="button" className="global-notice-close" onClick={() => setNotice("")} aria-label="关闭提示"><X size={16} /></button></aside>}</>;
}
