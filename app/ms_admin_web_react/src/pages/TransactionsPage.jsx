import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const TYPE_LABELS = { consume: "消耗", refund: "返还", recharge: "充值", adjust: "调整" };

/** 流水查询页：按类型/时间段/用户筛选，倒序分页展示全部积分变动。 */
export default function TransactionsPage() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [filters, setFilters] = useState({ type: "", userId: "", startTime: "", endTime: "" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const pageSize = 20;

  const load = useCallback(async function load() {
    try {
      const query = new URLSearchParams({ page: String(page), size: String(pageSize) });
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
      setData(await api.get(`/admin/credits/transactions?${query}`));
      setError("");
    } catch (loadError) { setError(loadError.message); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  return <section className="panel">
    <header className="panel-head">
      <div><h2>积分流水</h2><p>共 {data.total} 条记录；每个 Attempt 的消耗与返还各只会出现一次。</p></div>
    </header>
    <div className="filters">
      <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}>
        <option value="">全部类型</option>
        {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input value={filters.userId} onChange={(event) => updateFilter("userId", event.target.value)} placeholder="用户 ID" />
      <label className="inline">从 <input type="datetime-local" value={filters.startTime} onChange={(event) => updateFilter("startTime", event.target.value)} /></label>
      <label className="inline">到 <input type="datetime-local" value={filters.endTime} onChange={(event) => updateFilter("endTime", event.target.value)} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <table>
      <thead><tr><th>时间</th><th>用户</th><th>类型</th><th>变动</th><th>变动后余额</th><th>关联 Attempt</th><th>原因</th><th>操作人</th></tr></thead>
      <tbody>
        {data.items.map((item) => <tr key={item.id}>
          <td>{String(item.createdAt || "").replace("T", " ").slice(0, 19)}</td>
          <td><code>{String(item.userId || "").slice(0, 8)}…</code></td>
          <td><span className={`badge ${item.type === "consume" ? "cost" : "ok"}`}>{TYPE_LABELS[item.type] || item.type}</span></td>
          <td className={item.amount < 0 ? "neg" : "pos"}>{item.amount > 0 ? `+${item.amount}` : item.amount}</td>
          <td>{item.balanceAfter}</td>
          <td>{item.attemptId ? <code>{String(item.attemptId).slice(0, 8)}…</code> : "—"}</td>
          <td>{item.reason || "—"}</td>
          <td>{item.operatorId ? <code>{String(item.operatorId).slice(0, 8)}…</code> : "系统"}</td>
        </tr>)}
        {!data.items.length && <tr><td colSpan={8} className="empty">暂无流水记录。</td></tr>}
      </tbody>
    </table>
    <footer className="pager">
      <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
      <span>{page} / {totalPages}</span>
      <button type="button" className="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
    </footer>
  </section>;
}
