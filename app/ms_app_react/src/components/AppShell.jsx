import { ArrowLeft, Clock3, FolderOpen, LayoutGrid, Plus, Save, Sparkles, WandSparkles, Zap } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { image } from "../assets/mockData";
import { ROUTES } from "../config/routes";
import { ZH_CN } from "../locales/zh-CN";
import { useStore } from "../store/AppStore";

const navItems = [
  { to: ROUTES.create, label: "创作", icon: WandSparkles },
  { to: ROUTES.prompts, label: "提示词", icon: Sparkles },
  { to: ROUTES.library, label: "素材库", icon: FolderOpen },
  { to: ROUTES.community, label: "灵感", icon: LayoutGrid }
];

/** 提供应用侧边导航、顶部状态栏和全局通知。 */
export default function AppShell({ onLogout }) {
  const { credits, toast } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreateHome = location.pathname === ROUTES.create;
  const isPromptBuilder = location.pathname === "/create/prompt-builder";
  const isPrompts = location.pathname.startsWith(ROUTES.prompts);
  const activeLabel = isPrompts ? "提示词库" : navItems.find((item) => location.pathname.startsWith(item.to))?.label || "创作";

  async function logout() {
    await fetch("/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("mindscribe-user");
    onLogout?.();
    navigate(ROUTES.login, { replace: true });
  }

  return <div className="app-frame">
    <aside className="side-nav">
      <Link to={ROUTES.create} className="brand-lockup"><span className="brand-orbit"><WandSparkles size={16} /></span><b>MIND</b><i>SCRIBE</i></Link>
      <nav>{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="nav-bottom"><NavLink to={ROUTES.profile} className={({ isActive }) => `account-dock ${isActive ? "active" : ""}`}><img src={image("creator-avatar", 80, 80)} alt="我的头像" /><span><b>漫游的树</b><i><Zap size={12} /> {credits.toLocaleString()} {ZH_CN.creditsUnit}</i></span><span className="account-arrow">↗</span></NavLink><button className="logout-button" onClick={logout}>退出登录</button></div>
    </aside>
    <main className="app-main">
      <header className={`topbar ${isCreateHome ? "create-topbar" : ""} ${isPrompts ? "prompt-topbar" : ""}`}><strong>{isPromptBuilder ? "✦  构建提示词" : isCreateHome ? "开始创作" : activeLabel}</strong>
      {/* 创作首页顶栏的"新建任务"按钮：点击后通过自定义事件通知创作页重置状态。 */}
      {isCreateHome && <button className="new-creation-button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("start-new-creation"))}><Plus size={15} />新建任务</button>}
      {isPromptBuilder ? <div className="prompt-builder-top-actions"><Link to={ROUTES.create} className="prompt-builder-back"><ArrowLeft size={15} />返回创作</Link><button className="prompt-builder-save" type="button" onClick={() => window.dispatchEvent(new CustomEvent("imgs-prompt-save"))}><Save size={15} />保存</button></div> : !isPrompts && <div className="top-actions"><button className="icon-button" title="通知"><Clock3 size={17} /></button><Link to={ROUTES.create} className="quick-create"><Plus size={16} />{ZH_CN.newCreation}</Link></div>}</header>
      <Outlet />
    </main>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
