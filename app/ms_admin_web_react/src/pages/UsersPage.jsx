import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api";

/** 用户积分页：用户列表（含余额）+ 积分调整弹窗；调整必填原因并记录操作人。 */
export default function UsersPage() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
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

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return <section className="panel">
    <header className="panel-head">
      <div><h2>用户积分</h2><p>共 {data.total} 位用户；正向调整即充值，负向调整即扣减。</p></div>
      <form className="search" onSubmit={(event) => { event.preventDefault(); setPage(1); load(); }}>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="用户名 / 邮箱" />
        <button type="submit" className="ghost"><Search size={15} />搜索</button>
      </form>
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
