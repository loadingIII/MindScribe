import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { starterLibrary, starterPrompts, starterWorks } from "../assets/mockData";

const StoreContext = createContext(null);
const STORAGE_KEY = "mindscribe-web-demo-v1";
const REFERENCE_DB_NAME = "mindscribe-reference-images";
const REFERENCE_STORE_NAME = "images";
const CACHED_STATE_PREFIX = "mindscribe-create-state:";

/** 创作页可选的生图模型列表。 */
export const IMAGE_MODELS = ["gpt-image-2"];

/** 归一化模型值：已下线的模型（如 dall-e-3）统一迁移为当前默认模型。 */
export function normalizeModel(model) {
  return IMAGE_MODELS.includes(model) ? model : "gpt-image-2";
}

/** 清理指定的创作页缓存，避免新草稿恢复旧任务状态。 */
export function clearCachedState(keys) {
  keys.forEach((key) => {
    delete stateCache[key];
    try { localStorage.removeItem(`${CACHED_STATE_PREFIX}${key}`); } catch { /* 存储不可用时忽略清理失败。 */ }
  });
}

/**
 * 清空创作相关的本地持久化数据与内存缓存（不含按账号分键的提示词构建器草稿）。
 * 用于账号切换或退出登录，避免下一个账号看到上一个账号的遗留数据。
 */
export function clearWorkspaceStorage() {
  // 先清内存缓存，再清各持久化存储；任何一项失败都不影响其余清理。
  Object.keys(stateCache).forEach((key) => delete stateCache[key]);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略清理失败。 */ }
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHED_STATE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch { /* 忽略清理失败。 */ }
  clearReferenceDatabase().catch(() => {});
}

/** 删除 IndexedDB 中持久化的本地参考图。 */
function clearReferenceDatabase() {
  return openReferenceDatabase().then((database) => new Promise((resolve, reject) => {
    const request = database.transaction(REFERENCE_STORE_NAME, "readwrite").objectStore(REFERENCE_STORE_NAME).clear();
    request.onsuccess = () => { database.close(); resolve(); };
    request.onerror = () => { database.close(); reject(request.error); };
  }));
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

/** 读取本地缓存的登录用户信息，供刷新后侧边栏立即展示昵称。 */
function readStoredUser() {
  try { return JSON.parse(localStorage.getItem("mindscribe-user")) || null; } catch { return null; }
}

// 模块级缓存：页面组件因路由切换卸载时保留最近一次状态，重新挂载时恢复，避免跨页切换丢状态。
const stateCache = {};

/** 读取刷新前保存的轻量创作状态；文件列表由 IndexedDB 单独处理。 */
function loadCachedValue(key, initial) {
  if (key in stateCache) return stateCache[key];
  if (key === "create:files") return typeof initial === "function" ? initial() : initial;
  try {
    const stored = localStorage.getItem(`${CACHED_STATE_PREFIX}${key}`);
    if (stored !== null) return JSON.parse(stored);
  } catch { /* 存储不可用时回退到默认值。 */ }
  return typeof initial === "function" ? initial() : initial;
}

/** 用法与 useState 相同，但状态在卸载后会缓存在内存中，重挂载时恢复。 */
export function useCachedState(key, initial) {
  const [value, setValue] = useState(() => loadCachedValue(key, initial));
  useEffect(() => {
    stateCache[key] = value;
    // File/Blob 不写入 localStorage，参考图文件由 IndexedDB 持久化。
    if (key === "create:files") return;
    try { localStorage.setItem(`${CACHED_STATE_PREFIX}${key}`, JSON.stringify(value)); } catch { /* 忽略单个状态的持久化失败。 */ }
  }, [key, value]);
  return [value, setValue];
}

/** 将本地参考图保存到 IndexedDB，刷新后仍可恢复文件和预览。 */
function openReferenceDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(REFERENCE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(REFERENCE_STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 读取持久化的参考图记录。 */
export async function loadCachedReferences() {
  const database = await openReferenceDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(REFERENCE_STORE_NAME, "readonly").objectStore(REFERENCE_STORE_NAME).getAll();
    request.onsuccess = () => { database.close(); resolve(request.result || []); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

/** 用当前参考图替换 IndexedDB 中的持久化记录。 */
export async function saveCachedReferences(items) {
  const database = await openReferenceDatabase();
  const transaction = database.transaction(REFERENCE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(REFERENCE_STORE_NAME);
  store.clear();
  items.forEach((item) => {
    // 同时保存文件名和 MIME，兼容部分浏览器从 IndexedDB 取回 Blob 而非 File 的情况。
    if (item.file instanceof File) {
      store.put({ id: item.id, file: item.file, name: item.file.name, type: item.file.type });
    }
  });
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export function AppStore({ children }) {
  // loadState 每次渲染都会读 localStorage，这里只在首帧取一次作为初始值。
  const [initialState] = useState(loadState);
  const saved = initialState;
  // 当前登录用户（userId/email/displayName/role）：登录与 /auth/me 刷新后写入，供侧边栏与个人中心共用。
  const [user, setUser] = useState(() => readStoredUser());
  const [prompts, setPrompts] = useState(saved.prompts || starterPrompts);
  const [works, setWorks] = useState(saved.works || starterWorks);
  const [library, setLibrary] = useState(saved.library || starterLibrary);
  const initialDraft = saved.draft || {};
  const [draft, setDraft] = useState({
    ...initialDraft,
    prompt: initialDraft.prompt || "",
    // 旧草稿可能保存了已下线的模型（如 dall-e-3），加载时归一化为当前默认模型。
    model: normalizeModel(initialDraft.model || "gpt-image-2"),
    // 旧版本默认尺寸为 1024×1024，迁移为新的自动默认值。
    size: initialDraft.size === "1024×1024" && !initialDraft.quality ? "auto" : (initialDraft.size || "auto"),
    quality: initialDraft.quality || "auto",
    mode: initialDraft.mode || "文本生图",
    // 已上传或历史任务的参考图 URL 可安全持久化；本地 File 在保存时会被剥离。
    references: Array.isArray(initialDraft.references) ? initialDraft.references : []
  });
  const [credits, setCredits] = useState(saved.credits ?? 0);
  const [settings, setSettings] = useState(saved.settings || { public: true, remix: true, revealPrompt: true, downloads: true });
  const [following, setFollowing] = useState(saved.following || ["yun"]);
  const [toast, setToast] = useState("");

  /**
   * 重置创作工作台：清空本地持久化与内存缓存，并把 React 状态恢复为初始值。
   * 账号切换或退出登录时调用，避免上一个账号的数据遗留到下一个会话。
   * 用 useCallback 固定引用，供账号变化检测的副作用安全依赖。
   */
  const resetWorkspace = useCallback(function resetWorkspace() {
    clearWorkspaceStorage();
    setPrompts(starterPrompts);
    setWorks(starterWorks);
    setLibrary(starterLibrary);
    setDraft({
      prompt: "",
      model: "gpt-image-2",
      size: "auto",
      quality: "auto",
      mode: "文本生图",
      references: []
    });
    setCredits(2180);
    setSettings({ public: true, remix: true, revealPrompt: true, downloads: true });
    setFollowing(["yun"]);
  }, []);

  // 从服务端同步积分余额：登录后与每次生成结束（终态/失败）时调用。
  const refreshBalance = useCallback(async function refreshBalance() {
    try {
      const response = await fetch("/credits/balance", { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data?.balance === "number") setCredits(data.balance);
    } catch { /* 网络异常时保留当前展示值，不影响页面使用。 */ }
  }, []);

  /**
   * 修改当前用户昵称：调用后端保存成功后同步本地缓存与状态，
   * 侧边栏、个人中心等所有使用 user 的位置自动更新。
   */
  const updateDisplayName = useCallback(async function updateDisplayName(displayName) {
    const response = await fetch("/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "昵称修改失败");
    }
    const updated = await response.json();
    const next = { ...user, displayName: updated.displayName };
    setUser(next);
    try { localStorage.setItem("mindscribe-user", JSON.stringify(next)); } catch { /* 存储不可用时跳过缓存。 */ }
    return updated.displayName;
  }, [user]);

  /**
   * 上传新头像：multipart 提交到 /auth/avatar，成功后用返回的 OSS 地址
   * 同步本地缓存与状态，侧边栏与个人中心的头像立即更新。
   */
  const uploadAvatar = useCallback(async function uploadAvatar(file) {
    if (!file) throw new Error("请选择头像图片");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/auth/avatar", { method: "POST", body: form });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || "头像上传失败");
    }
    const data = await response.json();
    const next = { ...user, avatarUrl: data.avatarUrl };
    setUser(next);
    try { localStorage.setItem("mindscribe-user", JSON.stringify(next)); } catch { /* 存储不可用时跳过缓存。 */ }
    return data.avatarUrl;
  }, [user]);

  // 仅持久化可恢复的远程 URL 与展示元数据；本地 File/blob 地址不写入 localStorage。
  const persistableReferences = (draft.references || [])
    .filter((item) => item?.url && !String(item.url).startsWith("blob:"))
    .map((item) => ({
      id: item.id,
      url: item.url,
      name: item.file?.name || item.name || "参考图",
      type: item.file?.type || item.type || "image/*"
    }));
  const persistableDraft = { ...draft, references: persistableReferences };
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompts, works, library, draft: persistableDraft, credits, settings, following })); }, [prompts, works, library, draft, credits, settings, following]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2500); return () => clearTimeout(timer); }, [toast]);

  const value = useMemo(() => ({
    prompts, works, library, draft, credits, settings, following, toast, user, setDraft, setCredits, setSettings, setFollowing, setToast, setUser, resetWorkspace, refreshBalance, updateDisplayName, uploadAvatar,
    togglePrompt: (id) => setPrompts((items) => items.map((item) => item.id === id ? { ...item, saved: !item.saved } : item)),
    toggleWork: (id, kind) => setWorks((items) => items.map((item) => item.id === id ? { ...item, [kind]: !item[kind], likes: kind === "liked" ? item.likes + (item.liked ? -1 : 1) : item.likes } : item)),
    addPrompt: (template) => setPrompts((items) => [{ ...template, id: crypto.randomUUID(), source: "我的", saved: true }, ...items]),
    updatePrompt: (id, patch) => setPrompts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)),
    deletePrompt: (id) => setPrompts((items) => items.filter((item) => item.id !== id)),
    addComment: (id, comment) => setWorks((items) => items.map((item) => item.id === id ? { ...item, comments: [...item.comments, comment] } : item)),
    addLibraryWork: (work) => setLibrary((items) => [work, ...items])
  }), [prompts, works, library, draft, credits, settings, following, toast, user, resetWorkspace, refreshBalance, updateDisplayName, uploadAvatar]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore 必须在 AppStore 内使用");
  return store;
}
