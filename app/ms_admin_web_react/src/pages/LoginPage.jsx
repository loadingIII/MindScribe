import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WandSparkles } from "lucide-react";

/** 管理端登录页：复用客户端 /auth/login，登录后校验 admin 角色。 */
export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password) { setError("请输入邮箱和密码"); return; }
    setLoading(true); setError("");
    try {
      // 管理端使用独立账号体系（admin_users 表）与专用登录接口，与客户端登录互不相干。
      const response = await fetch("/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || (response.status === 401 ? "邮箱或密码错误" : "登录服务暂时不可用"));
      }
      const user = await response.json();
      localStorage.setItem("mindscribe-admin-user", JSON.stringify(user));
      onLogin(user);
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "登录失败，请稍后重试");
    } finally { setLoading(false); }
  }

  return <main className="login-wrap">
    <form className="login-card" onSubmit={submit}>
      <div className="login-logo"><span><WandSparkles size={16} /></span><b>MIND</b><i>SCRIBE</i></div>
      <h1>管理控制台</h1>
      <label><span>邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoFocus /></label>
      <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? "登录中…" : "登录"}</button>
    </form>
  </main>;
}
