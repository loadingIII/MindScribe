import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { LayoutDashboard, ScrollText, Users } from "lucide-react";
import { api } from "./api";
import LoginPage from "./pages/LoginPage";
import RulesPage from "./pages/RulesPage";
import UsersPage from "./pages/UsersPage";
import TransactionsPage from "./pages/TransactionsPage";

/** 读取本地缓存的登录用户（含角色）。 */
function readUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-admin-user")); } catch { return null; }
}

/** 管理端根组件：登录态守卫 + 侧边导航。 */
export default function App() {
  const [user, setUser] = useState(readUser);
  const navigate = useNavigate();

  useEffect(() => {
    // 会话失效（后端 401/403）时清除本地用户并回登录页。
    const invalidate = () => {
      localStorage.removeItem("mindscribe-admin-user");
      setUser(null);
      navigate("/login", { replace: true });
    };
    window.addEventListener("admin-auth-invalid", invalidate);
    return () => window.removeEventListener("admin-auth-invalid", invalidate);
  }, [navigate]);

  if (!user) return <Routes>
    <Route path="/login" element={<LoginPage onLogin={setUser} />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;

  return <div className="admin-shell">
    <aside className="admin-side">
      <div className="admin-brand"><b>MIND</b><i>SCRIBE</i><small>管理控制台</small></div>
      <nav>
        <NavLink to="/rules" className={({ isActive }) => isActive ? "active" : ""}><LayoutDashboard size={16} />计价规则</NavLink>
        <NavLink to="/users" className={({ isActive }) => isActive ? "active" : ""}><Users size={16} />用户积分</NavLink>
        <NavLink to="/transactions" className={({ isActive }) => isActive ? "active" : ""}><ScrollText size={16} />积分流水</NavLink>
      </nav>
      <div className="admin-side-footer">
        <span>{user.displayName || user.email || "管理员"}</span>
        <button type="button" onClick={() => {
          // 退出复用客户端登录接口：清除 JWT Cookie 后回到登录页。
          fetch("/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
            localStorage.removeItem("mindscribe-admin-user");
            setUser(null);
          });
        }}>退出登录</button>
      </div>
    </aside>
    <main className="admin-main">
      <Routes>
        <Route path="/" element={<Navigate to="/rules" replace />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="*" element={<Navigate to="/rules" replace />} />
      </Routes>
    </main>
  </div>;
}
