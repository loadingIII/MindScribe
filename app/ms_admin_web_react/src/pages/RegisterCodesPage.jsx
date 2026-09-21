import { useCallback, useEffect, useState } from "react";
import { MailCheck, RefreshCw } from "lucide-react";
import { api } from "../api";

const STATUS_LABELS = {
  active: { text: "有效", cls: "ok" },
  used: { text: "已使用", cls: "" },
  error: { text: "已失效", cls: "cost" }
};

/** 注册验证码页（临时）：邮件服务未接入，管理员在此查看验证码转告用户；接入后可移除。 */
export default function RegisterCodesPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState("");

  const load = useCallback(async function load() {
    try {
      const result = await api.get("/admin/register-codes");
      setItems(result.items || []);
      setLoadedAt(new Date().toLocaleTimeString());
      setError("");
    } catch (loadError) { setError(loadError.message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // 验证码 10 分钟过期：页面停留时每 30 秒自动刷新，保证看到的状态大致新鲜。
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return <section className="panel">
    <header className="panel-head">
      <div>
        <h2>注册验证码 <span className="badge">临时功能</span></h2>
        <p>邮件服务尚未接入，用户请求验证码后在此查看并转告；验证码 10 分钟内有效。<MailCheck size={13} style={{ verticalAlign: "-2px" }} /></p>
      </div>
      <div className="panel-actions">
        <span className="muted-note">{loadedAt && `更新于 ${loadedAt}`}</span>
        <button type="button" className="ghost" onClick={load}><RefreshCw size={15} />刷新</button>
      </div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <table>
      <thead><tr><th>邮箱</th><th>验证码</th><th>状态</th><th>请求时间</th></tr></thead>
      <tbody>
        {items.map((item, index) => {
          const status = STATUS_LABELS[item.status] || { text: item.status, cls: "" };
          return <tr key={`${item.email}-${item.createdAt}-${index}`}>
            <td>{item.email}</td>
            <td><b className="code-value">{item.code}</b></td>
            <td><span className={`badge ${status.cls}`}>{status.text}</span></td>
            <td>{String(item.createdAt || "").replace("T", " ").slice(0, 19)}</td>
          </tr>;
        })}
        {!items.length && <tr><td colSpan={4} className="empty">暂无请求记录；用户在注册页点击「获取验证码」后会出现在这里。</td></tr>}
      </tbody>
    </table>
  </section>;
}
