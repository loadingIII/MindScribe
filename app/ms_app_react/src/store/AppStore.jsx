import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { starterLibrary, starterPrompts, starterWorks } from "../assets/mockData";

const StoreContext = createContext(null);
const STORAGE_KEY = "mindscribe-web-demo-v1";

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

// 模块级缓存：页面组件因路由切换卸载时保留最近一次状态，重新挂载时恢复，避免跨页切换丢状态。
const stateCache = {};

/** 用法与 useState 相同，但状态在卸载后会缓存在内存中，重挂载时恢复。 */
export function useCachedState(key, initial) {
  const [value, setValue] = useState(key in stateCache ? stateCache[key] : initial);
  useEffect(() => { stateCache[key] = value; }, [key, value]);
  return [value, setValue];
}

export function AppStore({ children }) {
  const saved = loadState();
  const [prompts, setPrompts] = useState(saved.prompts || starterPrompts);
  const [works, setWorks] = useState(saved.works || starterWorks);
  const [library, setLibrary] = useState(saved.library || starterLibrary);
  const initialDraft = saved.draft || {};
  const [draft, setDraft] = useState({
    ...initialDraft,
    prompt: initialDraft.prompt || "",
    model: initialDraft.model || "gpt-image-2",
    // 旧版本默认尺寸为 1024×1024，迁移为新的自动默认值。
    size: initialDraft.size === "1024×1024" && !initialDraft.quality ? "auto" : (initialDraft.size || "auto"),
    quality: initialDraft.quality || "auto",
    mode: initialDraft.mode || "文本生图",
    // 参考图仅在内存中跨页共享，恢复持久化数据时一律置空。
    references: []
  });
  const [credits, setCredits] = useState(saved.credits ?? 2180);
  const [settings, setSettings] = useState(saved.settings || { public: true, remix: true, revealPrompt: true, downloads: true });
  const [following, setFollowing] = useState(saved.following || ["yun"]);
  const [toast, setToast] = useState("");

  // 参考图含 File 对象与 blob 地址，无法序列化，仅在内存中跨页共享；持久化时剥离以免存入损坏数据。
  const persistableDraft = { ...draft, references: [] };
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompts, works, library, draft: persistableDraft, credits, settings, following })); }, [prompts, works, library, draft, credits, settings, following]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2500); return () => clearTimeout(timer); }, [toast]);

  const value = useMemo(() => ({
    prompts, works, library, draft, credits, settings, following, toast, setDraft, setCredits, setSettings, setFollowing, setToast,
    togglePrompt: (id) => setPrompts((items) => items.map((item) => item.id === id ? { ...item, saved: !item.saved } : item)),
    toggleWork: (id, kind) => setWorks((items) => items.map((item) => item.id === id ? { ...item, [kind]: !item[kind], likes: kind === "liked" ? item.likes + (item.liked ? -1 : 1) : item.likes } : item)),
    addPrompt: (template) => setPrompts((items) => [{ ...template, id: crypto.randomUUID(), source: "我的", saved: true }, ...items]),
    updatePrompt: (id, patch) => setPrompts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)),
    deletePrompt: (id) => setPrompts((items) => items.filter((item) => item.id !== id)),
    addComment: (id, comment) => setWorks((items) => items.map((item) => item.id === id ? { ...item, comments: [...item.comments, comment] } : item)),
    addLibraryWork: (work) => setLibrary((items) => [work, ...items])
  }), [prompts, works, library, draft, credits, settings, following, toast]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore 必须在 AppStore 内使用");
  return store;
}
