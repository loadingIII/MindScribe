import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, WandSparkles } from "lucide-react";
import { ROUTES } from "../config/routes";

/** 登录页面：使用后端 Session 建立当前浏览器会话。 */
export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!username.trim() || !password) { setError("请输入用户名和密码"); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password })
      });
      if (response.status === 401) throw new Error("用户名或密码错误");
      if (response.status === 404) throw new Error("当前后端未加载登录接口，请重启 Java 服务");
      if (!response.ok) throw new Error("登录服务暂时不可用，请检查后端数据库配置");
      const user = await response.json();
      localStorage.setItem("mindscribe-user", JSON.stringify(user));
      onLogin(user);
      navigate(ROUTES.create, { replace: true });
    } catch (requestError) { setError(requestError.message || "登录失败，请稍后重试"); }
    finally { setLoading(false); }
  }

  return <main className="login-page">
    <div className="login-atmosphere" aria-hidden="true"><span /><span /><span /></div>
    <section className="login-panel">
      <div className="login-brand"><span><WandSparkles size={17} /></span><b>MIND</b><i>SCRIBE</i></div>
      <div className="login-copy"><small>CREATIVE OPERATING SYSTEM</small><h1>把灵感，<em>交给时间。</em></h1><p>登录你的创作空间，继续生成、回看和整理每一次尝试。</p></div>
      <form className="login-form" onSubmit={submit}>
        <label><span>用户名</span><input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入用户名" autoComplete="username" /></label>
        <label><span>密码</span><div className="login-password"><LockKeyhole size={15} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" autoComplete="current-password" /></div></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" disabled={loading}>{loading ? "正在验证…" : "进入工作台"}<ArrowRight size={16} /></button>
      </form>
      <footer>MindScribe · 你的视觉实验室</footer>
    </section>
  </main>;
}
