import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Check, PanelRight, Pencil, Plus, Sparkles, UserRound, WandSparkles, Zap } from "lucide-react";
import { image } from "../assets/mockData";
import { ROUTES } from "../config/routes";
import { ZH_CN } from "../locales/zh-CN";
import { useStore } from "../store/AppStore";
import { useEffect, useState } from "react";

const navItems = [
  { to: ROUTES.create, label: "创作", icon: WandSparkles },
  { to: ROUTES.prompts, label: "提示词", icon: Sparkles },
  { to: ROUTES.profile, label: "我的", icon: UserRound }
];

/** 提供应用侧边导航、顶部状态栏和全局通知。 */
export default function AppShell({ onLogout }) {
  const { credits, toast, user, resetWorkspace } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreateHome = location.pathname === ROUTES.create;
  const isPromptBuilder = location.pathname === "/create/prompt-builder";
  const isPrompts = location.pathname.startsWith(ROUTES.prompts);
  const isProfile = location.pathname.startsWith(ROUTES.profile);
  // 顶栏标题："我的"页展示"个人中心"，其余按导航匹配。
  const activeLabel = isProfile ? "个人中心" : isPrompts ? "提示词库" : navItems.find((item) => location.pathname.startsWith(item.to))?.label || "创作";

  // 创作页顶栏右侧控件状态：通过自定义事件与 LegacyApp 同步
  const [taskName, setTaskName] = useState("");
  const [editingTaskName, setEditingTaskName] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    const handleTaskNameUpdate = (event) => setTaskName(event.detail.taskName || "");
    const handleWorkspaceToggle = (event) => setWorkspaceOpen(event.detail.open);
    const handlePublishState = (event) => setCanPublish(event.detail.canPublish);
    
    window.addEventListener("topbar-task-name-update", handleTaskNameUpdate);
    window.addEventListener("topbar-workspace-state", handleWorkspaceToggle);
    window.addEventListener("topbar-publish-state", handlePublishState);
    
    return () => {
      window.removeEventListener("topbar-task-name-update", handleTaskNameUpdate);
      window.removeEventListener("topbar-workspace-state", handleWorkspaceToggle);
      window.removeEventListener("topbar-publish-state", handlePublishState);
    };
  }, []);

  function saveTaskName() {
    if (taskName.trim()) {
      window.dispatchEvent(new CustomEvent("topbar-save-task-name", { detail: { taskName: taskName.trim() } }));
    }
    setEditingTaskName(false);
  }

  function toggleWorkspace() {
    const newState = !workspaceOpen;
    setWorkspaceOpen(newState);
    window.dispatchEvent(new CustomEvent("topbar-toggle-workspace", { detail: { open: newState } }));
  }

  function openPublishModal() {
    window.dispatchEvent(new CustomEvent("topbar-open-publish-modal"));
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("mindscribe-user");
    // 退出前重置创作工作台，清除任务状态、参考图等本地缓存，避免遗留到下一个账号。
    resetWorkspace();
    onLogout?.();
    navigate(ROUTES.login, { replace: true });
  }

  return <div className="app-frame">
    <aside className="side-nav">
      <Link to={ROUTES.create} className="brand-lockup"><span className="brand-orbit"><WandSparkles size={16} /></span><b>MIND</b><i>SCRIBE</i></Link>
      <nav>{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="nav-bottom"><NavLink to={ROUTES.profile} className={({ isActive }) => `account-dock ${isActive ? "active" : ""}`}><img src={user?.avatarUrl || image("creator-avatar", 80, 80)} alt="我的头像" /><span><b>{user?.displayName || "未登录"}</b><i><Zap size={12} /> {credits.toLocaleString()} {ZH_CN.creditsUnit}</i></span><span className="account-arrow">↗</span></NavLink><button className="logout-button" onClick={logout}>退出登录</button></div>
    </aside>
    <main className={`app-main ${workspaceOpen ? "workspace-open" : ""}`}>
      <header className={`topbar ${isCreateHome ? "create-topbar" : ""} ${isPrompts ? "prompt-topbar" : ""}`}>
        {isCreateHome ? (
          <>
            {/* 创作页左侧：任务名称编辑区 */}
            <div className="topbar-task-name">
              {taskName ? (
                <>
                  <input 
                    className="task-name-input" 
                    value={taskName} 
                    maxLength={40}
                    readOnly={!editingTaskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    onBlur={saveTaskName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                        setEditingTaskName(false);
                      }
                    }}
                    aria-label="任务名称"
                  />
                  <button 
                    type="button" 
                    className="task-name-edit-btn" 
                    title={editingTaskName ? "保存" : "编辑"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (editingTaskName) {
                        saveTaskName();
                      } else {
                        setEditingTaskName(true);
                      }
                    }}
                  >
                    {editingTaskName ? <Check size={14} /> : <Pencil size={14} />}
                  </button>
                </>
              ) : (
                <span className="task-name-placeholder">未命名任务</span>
              )}
            </div>
            {/* 创作页右侧：新建任务、发布到模板、工作区 */}
            <div className="topbar-actions">
              <button 
                className="action-btn action-new" 
                type="button" 
                onClick={() => window.dispatchEvent(new CustomEvent("start-new-creation"))}
              >
                <Plus size={16} />
                <span>新建任务</span>
              </button>
              <button 
                className="action-btn action-publish" 
                type="button" 
                onClick={openPublishModal}
                disabled={!canPublish}
              >
                <ArrowUpRight size={16} />
                <span>发布到模板</span>
              </button>
              <button 
                className={`action-btn action-workspace ${workspaceOpen ? "is-active" : ""}`}
                type="button"
                aria-expanded={workspaceOpen}
                onClick={toggleWorkspace}
              >
                <PanelRight size={16} />
                <span>工作区</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="topbar-left">
              <strong>{isPromptBuilder ? "✦  构建提示词" : activeLabel}</strong>
            </div>
          </>
        )}
        {isPromptBuilder && <><Link to={ROUTES.create} className="prompt-builder-back"><ArrowLeft size={15} />返回创作</Link><div className="prompt-builder-top-actions"><button className="prompt-builder-save" type="button" onClick={() => window.dispatchEvent(new CustomEvent("imgs-prompt-save"))}><Check size={15} />保存</button></div></>}
      </header>
      <Outlet />
    </main>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
