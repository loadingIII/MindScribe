import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, WandSparkles } from "lucide-react";
import { ROUTES } from "../config/routes";
import { useStore } from "../store/AppStore";

/** 登录页面：使用后端 Session 建立当前浏览器会话。 */
export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  // 拿到创作工作台重置能力：换号登录前先清空上一个账号的创作数据。
  const { resetWorkspace, refreshBalance } = useStore();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";

  useEffect(() => {
    if (!countdown) return undefined;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  /** 请求注册验证码，并启动 60 秒重发倒计时。 */
  async function sendCode() {
    if (!email.trim()) { setError("请先输入邮箱"); return; }
    setError("");
    try {
      const response = await fetch("/auth/register/code", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: email.trim() }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message || "验证码发送失败"); }
      setCountdown(60);
    } catch (requestError) { setError(requestError.message || "验证码发送失败，请稍后重试"); }
  }

  /** 提交邮箱登录请求，并在成功后进入创作工作台。 */
  async function submit(event) {
    event.preventDefault();
    if (!email.trim() || !password || (isRegister && (!displayName.trim() || !verificationCode.trim()))) { setError(isRegister ? "请完整填写注册信息" : "请输入邮箱和密码"); return; }
    // 注册时校验密码规则与两次输入一致性，提前拦截避免等后端返回。
    if (isRegister) {
      if (password.length < 8 || password.length > 64) { setError("密码长度需在 8 到 64 位之间"); return; }
      if (password !== confirmPassword) { setError("两次输入的密码不一致"); return; }
    }
    setLoading(true); setError("");
    try {
      const response = await fetch(isRegister ? "/auth/register" : "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(isRegister ? { email: email.trim(), password, displayName: displayName.trim(), verificationCode: verificationCode.trim() } : { email: email.trim(), password })
      });
      if (response.status === 401) throw new Error("邮箱或密码错误");
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message || (isRegister ? "注册失败，请检查注册信息" : "登录服务暂时不可用")); }
      const user = await response.json();
      localStorage.setItem("mindscribe-user", JSON.stringify(user));
      // 切换到新账号前先重置创作工作台，确保创作页挂载时读不到上一个账号的缓存。
      resetWorkspace();
      // 登录成功即拉取该账号的积分余额，侧边栏与个人页立即可见。
      refreshBalance();
      onLogin(user);
      navigate(ROUTES.create, { replace: true });
    } catch (requestError) { setError(requestError.message || "登录失败，请稍后重试"); }
    finally { setLoading(false); }
  }

  return <main className="login-page">
    <div className="login-atmosphere" aria-hidden="true"><span /><span /><span /></div>
    <section className="login-panel">
      <div className="login-brand"><span><WandSparkles size={17} /></span><b>MIND</b><i>SCRIBE</i></div>
      <div className="login-copy"><small>CREATIVE OPERATING SYSTEM</small><h1>{isRegister ? <>加入创作，<em>从今天开始。</em></> : <>把灵感，<em>交给时间。</em></>}</h1><p>{isRegister ? "创建你的 MindScribe 账号，保存每一次灵感和视觉实验。" : "登录你的创作空间，继续生成、回看和整理每一次尝试。"}</p></div>
      <form className="login-form" onSubmit={submit}>
        {isRegister && <label><span>显示名</span><input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="输入显示名" autoComplete="name" /></label>}
        <label><span>邮箱</span><input type="email" autoFocus={!isRegister} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="输入邮箱" autoComplete="email" /></label>
        <label><span>密码{isRegister && <small className="field-hint">8-64 位</small>}</span><div className="login-password"><LockKeyhole size={15} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "设置密码（至少 8 位）" : "输入密码"} autoComplete={isRegister ? "new-password" : "current-password"} /></div></label>
        {isRegister && <label><span>确认密码</span><div className="login-password"><LockKeyhole size={15} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" autoComplete="new-password" /></div></label>}
        {isRegister && <label><span>邮箱验证码</span><div className="login-code"><input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="输入 6 位验证码" inputMode="numeric" maxLength={6} /><button type="button" onClick={sendCode} disabled={countdown > 0}>{countdown ? countdown + "s 后重发" : "获取验证码"}</button></div></label>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" disabled={loading}>{loading ? (isRegister ? "正在创建…" : "正在验证…") : (isRegister ? "创建账号" : "进入工作台")}<ArrowRight size={16} /></button>
      </form>
      <button className="login-switch" type="button" onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); setConfirmPassword(""); }}>{isRegister ? "已有账号？返回登录" : "还没有账号？立即注册"}</button>
      <footer>MindScribe · 你的视觉实验室</footer>
    </section>
  </main>;
}
