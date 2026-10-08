/** 个人中心：展示账号资料、真实积分余额与流水，支持修改昵称和头像。 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Eye, EyeOff, ImagePlus, KeyRound, Pencil, Zap } from "lucide-react";
import { image } from "../../assets/mockData";
import { useStore } from "../../store/AppStore";
import { Modal } from "../legacy/LegacyApp";
import { ROUTES } from "../../config/routes";
import { formatDate, formatRelativeTime } from "../../utils/format";
/** 流水类型到中文文案的映射，未识别的类型按原样展示。 */
const TX_TYPE_LABEL = {
  consume: "生成消耗",
  refund: "失败返还",
  recharge: "充值",
  adjust: "额度调整"
};
/** 流水筛选标签：value 为空串表示全部类型。 */
const TX_FILTERS = [
  { value: "", label: "全部" },
  { value: "consume", label: TX_TYPE_LABEL.consume },
  { value: "refund", label: TX_TYPE_LABEL.refund },
  { value: "recharge", label: TX_TYPE_LABEL.recharge },
  { value: "adjust", label: TX_TYPE_LABEL.adjust }
];
/** 每页拉取的流水条数，与后端单页上限保持一致。 */
const TX_PAGE_SIZE = 20;
/** 创作页线程恢复使用的 localStorage 键（与 LegacyApp 的 useCachedState 键一致）。 */
const CREATE_THREAD_KEY = "mindscribe-create-state:create:threadId";
/** 生图模式到中文文案的映射，与创作页「文本生图/图生图」叫法一致。 */
const MODE_LABEL = {
  "text-to-image": "文本生图",
  "image-to-image": "图生图"
};

/** 格式化流水时间：年-月-日 时:分，缺失值显示占位文案。 */
function formatTxTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).replace(/\//g, "-");
}

/** 个人中心业务组件：账户概览卡片、创作统计、最近作品与近期算力记录。 */
export default function ProfilePage() {
  const { credits, setToast, user, updateDisplayName, uploadAvatar } = useStore();
  const navigate = useNavigate();
  // 积分流水：进入页面时从后端拉取真实记录；txType 为空串表示不过滤类型。
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [txType, setTxType] = useState("");
  // 分页状态：total 来自后端响应，用于判断「加载更多」是否还有下一页。
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLoadingMore, setTxLoadingMore] = useState(false);
  // 创作统计与最近作品：进入页面时从聚合接口拉取；两段独立 state，任一失败静默降级。
  const [stats, setStats] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [gallery, setGallery] = useState([]);
  // 昵称编辑状态：editing 时展示输入框，name 为待保存的值。
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  // 头像上传状态：avatarUrl 为空时回退到默认占位头像。
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  // 修改密码弹窗状态：passwordOpen 控制显隐，三个输入框分别对应原密码/新密码/确认新密码；
  // showPassword 控制新密码与确认密码是否明文显示，原密码保持掩码不变。
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const avatarUrl = user?.avatarUrl || "";
  const displayName = user?.displayName || "未登录";

  // 用户信息异步到达后同步到编辑框初始值。
  useEffect(() => { if (!editing) setName(user?.displayName || ""); }, [user, editing]);

  // 拉取个人积分流水（按时间倒序，首页 20 条）；类型切换时重置列表重新拉取。
  useEffect(() => {
    let cancelled = false;
    setEntriesLoading(true);
    const query = new URLSearchParams({ page: "1", size: String(TX_PAGE_SIZE) });
    if (txType) query.set("type", txType);
    fetch(`/credits/transactions?${query}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setEntries(Array.isArray(data?.items) ? data.items : []);
        setTxTotal(Number(data?.total) || 0);
        setTxPage(1);
      })
      .catch(() => { /* 流水加载失败时保持空列表，不阻塞页面。 */ })
      .finally(() => { if (!cancelled) setEntriesLoading(false); });
    return () => { cancelled = true; };
  }, [txType]);

  /** 加载下一页流水并追加到列表尾部；后端 page 从 1 起计数。 */
  async function loadMoreEntries() {
    if (txLoadingMore || entries.length >= txTotal) return;
    setTxLoadingMore(true);
    try {
      const nextPage = txPage + 1;
      const query = new URLSearchParams({ page: String(nextPage), size: String(TX_PAGE_SIZE) });
      if (txType) query.set("type", txType);
      const response = await fetch(`/credits/transactions?${query}`);
      if (!response.ok) throw new Error("无法读取更多算力记录");
      const data = await response.json();
      setEntries((items) => [...items, ...(Array.isArray(data?.items) ? data.items : [])]);
      setTxTotal(Number(data?.total) || txTotal);
      setTxPage(nextPage);
    } catch (error) {
      setToast(error.message || "加载失败");
    } finally {
      setTxLoadingMore(false);
    }
  }

  // 拉取创作统计与最近作品（一次聚合请求）；失败时对应区块展示占位，不阻塞整页。
  useEffect(() => {
    let cancelled = false;
    fetch("/profile/summary?gallerySize=8")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setStats(data.stats || null);
        setPreferences(data.preferences || null);
        setGallery(Array.isArray(data.gallery) ? data.gallery : []);
      })
      .catch(() => { /* 聚合信息加载失败时保留空状态，不阻塞页面。 */ });
    return () => { cancelled = true; };
  }, []);

  /** 点击作品：预写创作页线程缓存键后跳转，创作页挂载时会按该键恢复线程。 */
  function openWorkInCreate(threadId) {
    if (!threadId) return;
    try { localStorage.setItem(CREATE_THREAD_KEY, JSON.stringify(threadId)); } catch { /* 存储不可用时仍可跳转。 */ }
    navigate(ROUTES.create);
  }

  /** 保存新昵称：成功后 Store 内的 user 同步更新，侧边栏立即生效。 */
  async function saveName() {
    const next = name.trim();
    if (!next) { setToast("昵称不能为空"); return; }
    if (next === displayName) { setEditing(false); return; }
    setSavingName(true);
    try {
      await updateDisplayName(next);
      setEditing(false);
      setToast("昵称已更新");
    } catch (error) {
      setToast(error.message || "昵称修改失败");
    } finally {
      setSavingName(false);
    }
  }

  /** 上传头像：校验格式后提交，成功后全站头像同步刷新。 */
  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    // 允许重复选择同一张图片：每次选择后重置 input 的值。
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setToast("头像必须是图片文件"); return; }
    if (file.size > 5 * 1024 * 1024) { setToast("头像图片不能超过 5MB"); return; }
    setUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      setToast("头像已更新");
    } catch (error) {
      setToast(error.message || "头像上传失败");
    } finally {
      setUploadingAvatar(false);
    }
  }

  /** 提交修改密码：前端先做一致性与长度校验，失败透传后端 message；成功后收起弹窗。 */
  async function savePassword(event) {
    event.preventDefault();
    if (newPassword.length < 8 || newPassword.length > 64) { setToast("新密码长度需在 8 到 64 位之间"); return; }
    if (newPassword !== confirmPassword) { setToast("两次输入的新密码不一致"); return; }
    setSavingPassword(true);
    try {
      const response = await fetch("/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "密码修改失败");
      closePasswordModal();
      setToast("密码已修改");
    } catch (error) {
      setToast(error.message || "密码修改失败");
    } finally {
      setSavingPassword(false);
    }
  }

  /** 关闭修改密码弹窗并清空输入，避免下次打开残留上一次内容。 */
  function closePasswordModal() {
    setPasswordOpen(false);
    setShowPassword(false);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return <section className="content-page profile-page">
    <header className="page-heading">
      <div>
        <h1>我的账户</h1>
        <p>算力与记录。</p>
      </div>
      <button type="button" className="password-entry" onClick={() => setPasswordOpen(true)}>
        <KeyRound size={14} /> 修改密码
      </button>
    </header>
    <section className="account-lead">
      <div className="account-person">
        <button
          type="button"
          className="avatar-edit"
          title={uploadingAvatar ? "正在上传头像…" : "更换头像"}
          disabled={uploadingAvatar}
          onClick={() => avatarInputRef.current?.click()}
        >
          <img src={avatarUrl || image("creator-avatar", 180, 180)} alt="我的头像" />
          <span className="avatar-edit-mask"><Camera size={15} />{uploadingAvatar ? "上传中" : "更换"}</span>
        </button>
        <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        <div>
          <span>创作者</span>
          {editing
            ? <div className="nickname-editor">
              <input
                autoFocus
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") saveName(); if (event.key === "Escape") setEditing(false); }}
                aria-label="修改昵称"
              />
              <button type="button" onClick={saveName} disabled={savingName || !name.trim()} title="保存">{savingName ? "…" : <Check size={15} />}</button>
              <button type="button" onClick={() => setEditing(false)} title="取消">✕</button>
            </div>
            : <h2>{displayName}<button type="button" className="nickname-edit-btn" title="修改昵称" onClick={() => { setName(displayName); setEditing(true); }}><Pencil size={13} /></button></h2>}
          <p>{user?.email || "—"}</p>
          {(user?.createdAt || user?.lastLoginAt) && (
            <p className="account-meta">
              {user?.createdAt && <span>加入于 {formatDate(user.createdAt)}</span>}
              {user?.createdAt && user?.lastLoginAt && <span className="account-meta-dot">·</span>}
              {user?.lastLoginAt && <span>上次登录 {formatRelativeTime(user.lastLoginAt)}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="credit-balance">
        <span><Zap size={12} /> 可用算力</span>
        <strong>{credits.toLocaleString()}</strong>
      </div>
    </section>
    <section className="account-stats">
      <h2>创作统计</h2>
      <div className="stats-grid">
        <div className="stat-cell">
          <b>{stats ? stats.totalImages.toLocaleString() : "—"}</b>
          <span>累计生成（张）</span>
        </div>
        <div className="stat-cell">
          <b>{stats ? stats.succeededCount.toLocaleString() : "—"}</b>
          <span>成功次数</span>
        </div>
        <div className="stat-cell">
          <b>{stats ? stats.failedCount.toLocaleString() : "—"}</b>
          <span>失败次数</span>
        </div>
        <div className="stat-cell">
          <b>{stats ? stats.monthConsumed.toLocaleString() : "—"}</b>
          <span>本月消耗算力</span>
        </div>
      </div>
      {preferences?.modelName && (
        <p className="stats-preference">
          常用模型 {preferences.modelName}
          {preferences.size && <> · 尺寸 {preferences.size}</>}
          {preferences.mode && <> · {MODE_LABEL[preferences.mode] || preferences.mode}</>}
          <button type="button" className="stats-create-link" onClick={() => navigate(ROUTES.create)}>去创作</button>
        </p>
      )}
    </section>
    <section className="profile-gallery">
      <h2>最近作品</h2>
      {!gallery.length && (
        <p className="ledger-empty">
          还没有作品，
          <button type="button" className="gallery-empty-link" onClick={() => navigate(ROUTES.create)}>去创作第一张</button>
        </p>
      )}
      {gallery.length > 0 && (
        <div className="gallery-grid">
          {gallery.map((item) => (
            <button
              key={item.attemptId}
              type="button"
              className="gallery-item"
              title={item.threadTitle || "查看作品"}
              onClick={() => openWorkInCreate(item.threadId)}
            >
              <img src={item.url} alt={item.threadTitle || "生成的作品"} loading="lazy" />
              <span className="gallery-item-caption">
                <b>{item.threadTitle || "未命名任务"}</b>
                <small>{formatDate(item.createdAt)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {gallery.length > 0 && (
        <button type="button" className="gallery-manage-link" onClick={() => navigate(ROUTES.create)}>
          <ImagePlus size={13} /> 在创作页查看全部任务
        </button>
      )}
    </section>
    <section className="ledger">
      <h2>近期算力记录</h2>
      <div className="ledger-filters" role="tablist" aria-label="算力记录类型筛选">
        {TX_FILTERS.map((filter) => (
          <button
            key={filter.value || "all"}
            type="button"
            role="tab"
            aria-selected={txType === filter.value}
            className={txType === filter.value ? "active" : ""}
            onClick={() => setTxType(filter.value)}
          >{filter.label}</button>
        ))}
      </div>
      {entriesLoading && <p className="ledger-empty">正在加载算力记录…</p>}
      {!entriesLoading && !entries.length && <p className="ledger-empty">暂无算力记录，创作后这里会展示每笔消耗与返还。</p>}
      {entries.map((item) => {
        const amount = Number(item.amount || 0);
        const income = amount > 0;
        return <div key={item.id}>
          <span>{TX_TYPE_LABEL[item.type] || item.reason || item.type}</span>
          <small>{formatTxTime(item.createdAt)}</small>
          <b className={income ? "income" : ""}>{income ? "+" : ""}{amount}</b>
        </div>;
      })}
      {!entriesLoading && entries.length < txTotal && (
        <button type="button" className="ledger-more" onClick={loadMoreEntries} disabled={txLoadingMore}>
          {txLoadingMore ? "加载中…" : "加载更多"}
        </button>
      )}
    </section>
    {passwordOpen && (
      <Modal title="修改密码" onClose={closePasswordModal}>
        <form className="template-form password-form" onSubmit={savePassword}>
            <p className="password-form-hint">密码长度 8-64 位，修改后下次登录使用新密码。</p>
            <label>
              <span className="template-form-label-text">原密码</span>
              <input
                type="password"
                value={oldPassword}
                autoComplete="current-password"
                onChange={(event) => setOldPassword(event.target.value)}
                required
                autoFocus
              />
            </label>
            <label>
              <span className="template-form-label-text">新密码</span>
              <span className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={64}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-eye"
                  title={showPassword ? "隐藏密码" : "查看密码"}
                  aria-label={showPassword ? "隐藏新密码" : "查看新密码"}
                  onClick={() => setShowPassword((current) => !current)}
                >{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </span>
            </label>
            <label>
              <span className="template-form-label-text">确认新密码</span>
              <span className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-eye"
                  title={showPassword ? "隐藏密码" : "查看密码"}
                  aria-label={showPassword ? "隐藏确认密码" : "查看确认密码"}
                  onClick={() => setShowPassword((current) => !current)}
                >{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </span>
            </label>
            <div className="password-form-actions">
              <button type="button" className="password-cancel" onClick={closePasswordModal}>取消</button>
              <button type="submit" className="primary-action" disabled={savingPassword || !oldPassword || !newPassword}>
                {savingPassword ? "保存中…" : "保存"}
              </button>
            </div>
        </form>
      </Modal>
    )}
  </section>;
}
