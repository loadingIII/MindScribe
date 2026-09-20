/** 个人中心：展示账号资料、真实积分余额与流水，支持修改昵称和头像。 */
import { useEffect, useRef, useState } from "react";
import { Camera, Check, Pencil, Zap } from "lucide-react";
import { image } from "../../assets/mockData";
import { useStore } from "../../store/AppStore";
/** 流水类型到中文文案的映射，未识别的类型按原样展示。 */
const TX_TYPE_LABEL = {
  consume: "生成消耗",
  refund: "失败返还",
  recharge: "充值",
  adjust: "额度调整"
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

/** 个人中心业务组件：账户概览、隐私设置与版权说明三个页签。 */
export default function ProfilePage() {
  const { credits, settings, setSettings, user, updateDisplayName, uploadAvatar, refreshBalance, setToast } = useStore();
  const [tab, setTab] = useState("概览");
  // 积分流水：进入页面时从后端拉取真实记录。
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  // 昵称编辑状态：editing 时展示输入框，name 为待保存的值。
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  // 头像上传状态：avatarUrl 为空时回退到默认占位头像。
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);
  const avatarUrl = user?.avatarUrl || "";
  const displayName = user?.displayName || "未登录";

  // 用户信息异步到达后同步到编辑框初始值。
  useEffect(() => { if (!editing) setName(user?.displayName || ""); }, [user, editing]);

  // 拉取个人积分流水（按时间倒序，首屏取 20 条）；路由切回时组件重挂载会重新拉取。
  useEffect(() => {
    let cancelled = false;
    setEntriesLoading(true);
    fetch("/credits/transactions?page=1&size=20")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setEntries(Array.isArray(data?.items) ? data.items : []); })
      .catch(() => { /* 流水加载失败时保持空列表，不阻塞页面。 */ })
      .finally(() => { if (!cancelled) setEntriesLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  return <section className="content-page profile-page">
    <header className="page-heading"><div><h1>我的账户</h1><p>算力、权限与记录。</p></div></header>
    <div className="profile-tabs">{["概览", "隐私设置", "版权说明"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
    {tab === "概览" && <>
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
          </div>
        </div>
        <div className="credit-balance">
          <span><Zap size={12} /> 可用算力</span>
          <strong>{credits.toLocaleString()}</strong>
          <button
            type="button"
            onClick={async () => { await refreshBalance(); setToast("余额已刷新"); }}
            title="重新获取最新余额"
          >
            刷新余额
          </button>
        </div>
      </section>
      <section className="profile-columns">
        <div className="ledger">
          <h2>近期算力记录</h2>
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
        </div>
        <div className="membership">
          <span>MindScribe Plus</span>
          <h2>更快的队列，<br />更大的想象空间。</h2>
          <ul>
            <li><Check size={15} />高速生成队列</li>
            <li><Check size={15} />高清无水印导出</li>
            <li><Check size={15} />100GB 创作存储空间</li>
          </ul>
          <button className="primary-action">查看 Plus 方案</button>
        </div>
      </section>
    </>}
    {tab === "隐私设置" && <section className="settings-panel">{[["public", "作品默认公开", "公开后可在灵感广场被发现"], ["remix", "允许他人复刻", "复刻时会带入你的模型参数"], ["revealPrompt", "展示提示词", "他人可查看并学习你的创作语言"], ["downloads", "允许下载", "社区用户可下载公开作品的带水印版本"]].map(([key, title, copy]) => <label className="toggle-row" key={key}><div><b>{title}</b><span>{copy}</span></div><input type="checkbox" checked={settings[key]} onChange={() => setSettings({ ...settings, [key]: !settings[key] })} /><i /></label>)}</section>}
    {tab === "版权说明" && <section className="copyright-panel"><div><span>个人使用</span><h2>你生成的作品，属于你的创作记录。</h2><p>可用于个人社交分享、作品展示和非商业项目。含有他人素材的作品应获得相应授权。</p></div><div><span>商业使用</span><h2>请在商用前确认素材与模型条款。</h2><p>商业项目需遵守所选模型与参考素材的使用许可；平台不替代版权审查。</p></div><div><span>社区分享</span><h2>公开是邀请，不是放弃署名。</h2><p>你可随时关闭复刻、提示词展示和下载权限，历史收藏不会改变原作品归属。</p></div></section>}
  </section>;
}
