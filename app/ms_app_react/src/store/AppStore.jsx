import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { starterLibrary, starterPrompts, starterWorks } from "../assets/mockData";

const StoreContext = createContext(null);
const STORAGE_KEY = "mindscribe-web-demo-v1";

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

export function AppStore({ children }) {
  const saved = loadState();
  const [prompts, setPrompts] = useState(saved.prompts || starterPrompts);
  const [works, setWorks] = useState(saved.works || starterWorks);
  const [library, setLibrary] = useState(saved.library || starterLibrary);
  const [draft, setDraft] = useState(saved.draft || { prompt: "", model: "gpt-image-2", size: "1024×1024", mode: "文本生图" });
  const [credits, setCredits] = useState(saved.credits ?? 2180);
  const [settings, setSettings] = useState(saved.settings || { public: true, remix: true, revealPrompt: true, downloads: true });
  const [following, setFollowing] = useState(saved.following || ["yun"]);
  const [toast, setToast] = useState("");

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompts, works, library, draft, credits, settings, following })); }, [prompts, works, library, draft, credits, settings, following]);
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
