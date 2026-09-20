import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { api } from "../api";

const EMPTY_FORM = { email: "", password: "", displayName: "" };

/** 用户积分页：用户列表（含余额）+ 创建用户 + 积分调整弹窗；调整必填原因并记录操作人。 */
export default function UsersPage() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pageSize = 20;

  const load = useCallback(async function load() {
    try {
      const query = new URLSearchParams({ page: String(page), size: String(pageSize) });
      if (keyword.trim()) query.set("keyword", keyword.trim());
      setData(await api.get(`/admin/users?${query}`));
      setError("");
    } catch (loadError) { setError(loadError.message); }
  }, [keyword, page]);

  useEffect(() => { load(); }, [load]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2500);
  }

  /** 提交调整：amount 带符号（正充值负扣减），reason 必填。 */
  async function submitAdjust(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) { setError("调整量必须是非 0 整数"); return; }
    if (!reason.trim()) { setError("调整原因必填"); return; }
    try {
      const result = await api.post(`/admin/users/${adjusting.id}/credits/adjust`, { amount: value, reason: reason.trim() });
      flash(`调整成功，用户当前余额 ${result.balance}`);
      setAdjusting(null); setAmount(""); setReason("");
      load();
    } catch (adjustError) { setError(adjustError.message); }
  }

  /** 创建用户：跳过验证码直接建档，新用户与其他注册渠道一样默认 100 积分。 */
  async function submitCreate(event) {
    event.preventDefault();
    if (!form.email.trim() || !form.displayName.trim()) { setError("请填写邮箱与显示名"); return; }
    if (form.password.length < 8) { setError("密码至少 8 位"); return; }
    try {
      const result = await api.post("/admin/users", form);
      flash(`用户 ${result.email} 已创建（默认赠送 100 积分）`);
      setCreating(false);
      setForm(EMPTY_FORM);
      load();
    } catch (createError) { setError(createError.message); }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return <section className="panel">
    <header className="panel-head">
      <div><h2>用户积分</h2><p>共 {data.total} 位用户；正向调整即充值，负向调整即扣减。</p></div>
      <div className="panel-actions">
        <form className="search" onSubmit={(event) => { event.preventDefault(); setPage(1); load(); }}>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="用户名 / 邮箱" />
          <button type="submit" className="ghost"><Search size={15} />搜索</button>
        </form>
        <button type="button" onClick={() => { setCreating(true); setError(""); }}><UserPlus size={15} />创建用户</button>
      </div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-ok">{message}</p>}
    <table>
      <thead><tr><th>用户</th><th>邮箱</th><th>角色</th><th>状态</th><th>积分余额</th><th>注册时间</th><th></th></tr></thead>
      <tbody>
        {data.items.map((item) => <tr key={item.id}>
          <td><b>{item.displayName || item.username || "未命名"}</b></td>
          <td>{item.email || "—"}</td>
          <td>{item.role === "admin" ? <span className="badge">管理员</span> : "用户"}</td>
          <td>{item.status}</td>
          <td><b>{Number(item.creditBalance).toLocaleString()}</b></td>
          <td>{String(item.createdAt || "").slice(0, 10)}</td>
          <td className="row-actions"><button type="button" onClick={() => { setAdjusting(item); setError(""); }}>调整积分</button></td>
        </tr>)}
        {!data.items.length && <tr><td colSpan={7} className="empty">没有匹配的用户。</td></tr>}
      </tbody>
    </table>
    <footer className="pager">
      <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
      <span>{page} / {totalPages}</span>
      <button type="button" className="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
    </footer>

    {creating && <div className="modal-mask" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submitCreate}>
        <h3>创建用户账号</h3>
        <p className="modal-hint">跳过邮箱验证码直接建档；新用户默认赠送 100 积分。</p>
        <label><span>邮箱</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="user@example.com" autoFocus /></label>
        <label><span>显示名</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="用户的展示名称" /></label>
        <label><span>初始密码（8-64 位）</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 8 位" /></label>
        <footer>
          <button type="button" className="ghost" onClick={() => setCreating(false)}>取消</button>
          <button type="submit">创建</button>
        </footer>
      </form>
    </div>}

    {adjusting && <div className="modal-mask" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submitAdjust}>
        <h3>调整积分 · {adjusting.displayName || adjusting.email}</h3>
        <p className="modal-hint">当前余额 {Number(adjusting.creditBalance).toLocaleString()}</p>
        <label><span>调整量（正充值 / 负扣减）</span><input type="number" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="如 100 或 -50" autoFocus /></label>
        <label><span>调整原因（必填）</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="如：活动奖励 / 客诉补偿" /></label>
        <footer>
          <button type="button" className="ghost" onClick={() => setAdjusting(null)}>取消</button>
          <button type="submit">确认调整</button>
        </footer>
      </form>
    </div>}
  </section>;
}
