import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { api } from "../api";

const ROLE_LABELS = { "super-admin": "超级管理员", admin: "管理员", user: "普通用户" };

function readUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-admin-user")); } catch { return null; }
}

/** 管理员管理页：仅 super-admin 可见；支持创建管理员与调整角色，保护最后一个 super-admin。 */
export default function AdminsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "admin" });
  const currentUser = readUser();
  // 是否超级管理员：决定本页是否渲染（后端同样二次校验，前端隐藏只是体验层）。
  const isSuper = currentUser?.role === "super-admin";

  const load = useCallback(async function load() {
    try {
      const result = await api.get("/admin/admins");
      setItems(result.items || []);
      setError("");
    } catch (loadError) { setError(loadError.message); }
  }, []);

  useEffect(() => { if (isSuper) load(); }, [isSuper, load]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2500);
  }

  async function submitCreate(event) {
    event.preventDefault();
    try {
      await api.post("/admin/admins", form);
      flash(`管理员 ${form.email} 已创建`);
      setCreating(false);
      setForm({ email: "", password: "", displayName: "", role: "admin" });
      load();
    } catch (createError) { setError(createError.message); }
  }

  async function changeRole(item, role) {
    if (item.role === role) return;
    if (!window.confirm(`确认把 ${item.email} 的角色调整为「${ROLE_LABELS[role]}」？`)) return;
    try {
      await api.post(`/admin/admins/${item.id}/role`, { role });
      flash(`角色已调整为「${ROLE_LABELS[role]}」`);
      load();
    } catch (adjustError) { setError(adjustError.message); }
  }

  if (!isSuper) return <section className="panel">
    <header className="panel-head"><div><h2>管理员账号</h2></div></header>
    <p className="empty" style={{ padding: "30px 0", textAlign: "center", color: "#98a6b8" }}>
      仅超级管理员可以管理管理员账号。
    </p>
  </section>;

  return <section className="panel">
    <header className="panel-head">
      <div><h2>管理员账号 <ShieldCheck size={17} style={{ verticalAlign: "-3px" }} /></h2><p>创建管理员、调整角色；系统始终保留至少一个超级管理员。</p></div>
      <div className="panel-actions">
        <button type="button" onClick={() => setCreating(true)}><UserPlus size={15} />创建管理员</button>
      </div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-ok">{message}</p>}
    <table>
      <thead><tr><th>显示名</th><th>邮箱</th><th>角色</th><th>状态</th><th>最近登录</th><th></th></tr></thead>
      <tbody>
        {items.map((item) => <tr key={item.id}>
          <td><b>{item.displayName || "未命名"}</b></td>
          <td>{item.email || item.username || "—"}</td>
          <td>
            {item.role === "super-admin"
              ? <span className="badge ok">{ROLE_LABELS[item.role]}</span>
              : <span className="badge">{ROLE_LABELS[item.role] || item.role}</span>}
          </td>
          <td>{item.status}</td>
          <td>{item.lastLoginAt ? String(item.lastLoginAt).replace("T", " ").slice(0, 19) : "从未登录"}</td>
          <td className="row-actions">
            {item.role !== "super-admin" && <button type="button" className="ghost" onClick={() => changeRole(item, "super-admin")}>设为超管</button>}
            {item.role === "super-admin" && <button type="button" className="ghost danger" onClick={() => changeRole(item, "admin")}>降为管理员</button>}
            {item.role === "admin" && <button type="button" className="ghost danger" onClick={() => changeRole(item, "user")}>移除管理员</button>}
          </td>
        </tr>)}
        {!items.length && <tr><td colSpan={6} className="empty">暂无管理员账号。</td></tr>}
      </tbody>
    </table>

    {creating && <div className="modal-mask" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submitCreate}>
        <h3>创建管理员账号</h3>
        <label><span>邮箱</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="admin@example.com" autoFocus /></label>
        <label><span>显示名</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="管理员的展示名称" /></label>
        <label><span>初始密码（8-64 位）</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 8 位" /></label>
        <label><span>角色</span>
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="admin">管理员（可进管理端日常操作）</option>
            <option value="super-admin">超级管理员（可管理管理员账号）</option>
          </select>
        </label>
        <footer>
          <button type="button" className="ghost" onClick={() => setCreating(false)}>取消</button>
          <button type="submit">创建</button>
        </footer>
      </form>
    </div>}
  </section>;
}
