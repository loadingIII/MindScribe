import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowDownToLine, ArrowRight, Bookmark, Check, ChevronDown, Clock3, Copy, Download, Pencil,
  FileImage, FolderOpen, Heart, ImagePlus, Layers3, LayoutGrid, Maximize2, MessageCircle, MoreHorizontal,
  Palette, Plus, Search, Send, Settings2, Sparkles, Star, Trash2, UploadCloud, UserRound,
  WandSparkles, X, Zap, PanelRight, RotateCw
} from "lucide-react";

// Attempt.prompt 现在存的是结构化提示词 JSON；展示与回填时只取其中的 user_prompt 可读文本。
function readablePrompt(value) {
  const text = String(value || "");
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && typeof data.user_prompt === "string" && data.user_prompt.trim()) {
      return data.user_prompt;
    }
  } catch { /* 非 JSON 内容按原文返回，兼容旧数据。 */ }
  return text;
}

// 任务线程与尝试记录的统一视图映射。
function mapThread(thread, title) {
  const references = typeof thread.referenceImages === "string" ? (() => { try { return JSON.parse(thread.referenceImages); } catch { return []; } })() : (thread.referenceImages || []);
  const sourceAttempts = [...(thread.attempts || [])].sort((a, b) => (a.attemptNo ?? a.attempt_no ?? 0) - (b.attemptNo ?? b.attempt_no ?? 0));
  const attempts = sourceAttempts.map((item, index) => {
    const status = String(item.status || "pending").toLowerCase();
    const storedResults = typeof item.results === "string" ? (() => { try { return JSON.parse(item.results); } catch { return []; } })() : (item.results || []);
    const imageUrls = item.imageUrls || item.image_urls || storedResults.map((result) => result.url).filter(Boolean);
    return {
      id: item.attemptId || item.attempt_id || item.id,
      attemptNo: item.attemptNo ?? item.attempt_no ?? index + 1,
      taskId: item.taskId || item.task_id || item.externalTaskId,
      imageUrls,
      modelName: item.modelName,
      prompt: readablePrompt(item.prompt),
      size: item.size,
      quality: item.quality,
      error: item.error || "",
      label: `#${String(index + 1).padStart(2, "0")}`,
      status: statusText(status),
      rawStatus: status,
      progress: status === "succeeded" ? 100 : 24
    };
  });
  return { id: thread.threadId || thread.id, title: title || thread.title || thread.prompt || "未命名创作", prompt: thread.prompt || "", status: attempts.at(-1)?.status || statusText(thread.status), createdAt: thread.createdAt || "刚刚", thumbnail: references[0]?.url || references[0]?.objectKey || references[0], references, attempts };
}

// 将提示词构建页带回的标签压缩为标签栏内容：总长限制在 20 字左右，被截断的标签以 ... 结尾。
function buildTagChips(tags) {
  const list = [];
  let used = 0;
  for (const tag of tags) {
    const text = tag.value ? `${tag.key}：${tag.value}` : tag.key;
    if (used + text.length <= 20) {
      list.push(text);
      used += text.length;
      continue;
    }
    const remain = 20 - used;
    if (remain >= 2) list.push(`${text.slice(0, remain)}...`);
    break;
  }
  return list;
}

function statusText(status) {
  return { pending: "待生成", running: "生成中", succeeded: "已生成", failed: "失败" }[status] || "待生成";
}

// 将历史记录中的旧质量值统一转换为当前接口支持的枚举。
function normalizeQuality(value) {
  const normalized = String(value || "auto").toLowerCase();
  if (["standard", "标准"].includes(normalized)) return "medium";
  if (["高", "high"].includes(normalized)) return "high";
  if (["低", "low"].includes(normalized)) return "low";
  return ["auto", "low", "medium", "high"].includes(normalized) ? normalized : "auto";
}

// 统一尺寸值，兼容历史界面保存的 Auto 和中文乘号。
function normalizeSize(value) {
  const normalized = String(value || "auto").toLowerCase().replace("×", "x");
  return ["auto", "1024x1024", "2048x2048", "1536x1024", "2048x1152", "3840x2160", "1024x1536", "2160x3840"].includes(normalized) ? normalized : "auto";
}

// gpt-image-2 的尺寸直接使用 API 接受的像素值，避免以比例误导用户。
const GPT_IMAGE_SIZE_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "2048x2048", label: "2048 × 2048" },
  { value: "1536x1024", label: "1536 × 1024" },
  { value: "2048x1152", label: "2048 × 1152" },
  { value: "3840x2160", label: "3840 × 2160" },
  { value: "1024x1536", label: "1024 × 1536" },
  { value: "2160x3840", label: "2160 × 3840" }
];

function defaultThreadTitle(threads = []) {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(-2)}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${date}任务${threads.filter((item) => item.title?.startsWith(date)).length + 1}`;
}

// 下载图片时移除文件系统不允许的字符，保留用户可读的任务名称。
function safeDownloadName(value) {
  return String(value || "创作").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 80) || "创作";
}

function triggerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadResultImage(url, filename) {
  // 浏览器直接下载原图，不依赖后端下载接口。
  triggerDownload(url, filename);
}
import { image } from "../../assets/mockData";
import { useCachedState, useStore } from "../../store/AppStore";
import { buildGenImgsPrompt, GEN_IMGS_SYSTEM_PROMPT } from "../../utils/prompts/gen_imgs_prompts";
import SelectField from "../../components/SelectField";

// 当前登录用户 ID 由部署环境注入，不能把数据库 UUID 写死在前端。
const CONFIGURED_USER_ID = import.meta.env.VITE_USER_ID || "";

gsap.registerPlugin(ScrollTrigger);

const navItems = [
  { to: "/create", label: "创作", icon: WandSparkles },
  { to: "/prompts", label: "提示词", icon: Sparkles },
  { to: "/library", label: "素材库", icon: FolderOpen },
  { to: "/community", label: "灵感", icon: LayoutGrid },
  { to: "/profile", label: "个人中心", icon: UserRound }
];
const categories = ["全部", "头像", "壁纸", "海报", "插画", "明信片", "小红书插图"];

function formatNumber(value) {
  // 将数量格式化为紧凑的中文界面显示文本。
  return value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function referenceLabel(name) {
  // 引用提示词和候选菜单均展示原始 filename，便于用户识别参考图。
  return name;
}

function editorPromptText(element) {
  return Array.from(element.childNodes).map((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset.promptValue ? node.dataset.promptValue : node.textContent || "").join("").replace(/\u200b/g, "");
}

function createMentionChip(file) {
  // 标签在视觉上只显示 filename，提交时使用 data-prompt-value 还原为文本标记。
  const chip = document.createElement("span");
  const filename = referenceLabel(file.file.name);
  chip.className = "mention-chip";
  chip.contentEditable = "false";
  chip.dataset.fileId = file.id;
  chip.dataset.promptValue = `[${filename}]`;
  chip.textContent = filename;
  return chip;
}

function renderPromptContent(editor, value, files) {
  // 将已保存的引用标记恢复为标签，同时兼容此前的 [序号:filename] 格式。
  const tokenPattern = /\[(?:(\d+):)?([^\]\n]+)\]/g;
  const text = String(value || "");
  let cursor = 0;
  let match;
  editor.replaceChildren();
  while ((match = tokenPattern.exec(text))) {
    editor.append(document.createTextNode(text.slice(cursor, match.index)));
    const file = match[1] ? files[Number(match[1]) - 1] : files.find((item) => referenceLabel(item.file.name) === match[2]);
    if (file) {
      const chip = createMentionChip(file);
      chip.dataset.promptValue = match[0];
      editor.append(chip);
    } else {
      editor.append(document.createTextNode(match[0]));
    }
    cursor = match.index + match[0].length;
  }
  editor.append(document.createTextNode(text.slice(cursor)));
}

function removeAdjacentMention(editor, key) {
  // contentEditable 的不可编辑标签在首位时无法由浏览器稳定删除，因此手动处理标签后的 Backspace。
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;
  const { startContainer, startOffset } = range;
  let chip = null;
  if (startContainer === editor) {
    chip = editor.childNodes[startOffset - 1];
  } else if (startContainer.nodeType === Node.TEXT_NODE) {
    if (key === "Backspace" && startOffset === 0) chip = startContainer.previousSibling;
  }
  if (!(chip instanceof HTMLElement) || !chip.classList.contains("mention-chip")) return false;
  const position = Array.from(editor.childNodes).indexOf(chip);
  chip.remove();
  const nextRange = document.createRange();
  nextRange.setStart(editor, position);
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  return true;
}

export function LegacyApp() {
  // 配置全局导航、通知和页面路由。
  const { credits, toast } = useStore();
  const location = useLocation();
  return (
    <div className="app-frame">
      <aside className="side-nav">
        <Link to="/create" className="brand-lockup"><span className="brand-orbit"><WandSparkles size={17} /></span><b>MIND</b><i>SCRIBE</i></Link>
        <nav>{navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
        <div className="nav-bottom"><div className="credit-chip"><Zap size={14} />{credits.toLocaleString()} 算力</div><NavLink to="/profile" className="profile-mini"><img src={image("creator-avatar", 80, 80)} alt="我的头像" /><span>漫游的树</span></NavLink></div>
      </aside>
      <main className="app-main">
        <header className="topbar"><div><span className="breadcrumb">MindScribe</span><span className="slash">/</span><strong>{navItems.find((item) => location.pathname.startsWith(item.to))?.label || "创作"}</strong></div><div className="top-actions"><button className="icon-button" title="通知"><Clock3 size={17} /></button><Link to="/create" className="quick-create"><Plus size={16} />新建创作</Link></div></header>
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

export function CreatePage() {
  // 渲染多模式生图工作台，并模拟异步生成任务。
  const { draft, setDraft, credits, setCredits, addLibraryWork, setToast } = useStore();
  const navigate = useNavigate();
  const mode = "创作";
  // 提示词以全局草稿为唯一数据源：输入实时写回 draft，跳转提示词构建页时内容保持一致。
  const [prompt, setPrompt] = useState(draft.prompt || "");
  // 任务相关状态通过内存缓存跨页保留，避免在创作页与提示词构建页之间切换时丢失。
  const [files, setFiles] = useCachedState("create:files", []);
  const [referencesLocked, setReferencesLocked] = useCachedState("create:referencesLocked", false);
  const count = 1;
  const [status, setStatus] = useCachedState("create:status", "idle");
  const [threadId, setThreadId] = useCachedState("create:threadId", "");
  const [results, setResults] = useCachedState("create:results", []);
  const [previewResult, setPreviewResult] = useState(null);
  const [promptFullscreen, setPromptFullscreen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [additionalSystemPrompt, setAdditionalSystemPrompt] = useState(draft.additionalSystemPrompt || "");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState("tasks");
  const [workspaceWidth, setWorkspaceWidth] = useState(340);
  const [workspaceThreadId, setWorkspaceThreadId] = useState("");
  const [taskThreads, setTaskThreads] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(CONFIGURED_USER_ID);
  const [taskName, setTaskName] = useCachedState("create:taskName", () => defaultThreadTitle());
  const [editingTaskName, setEditingTaskName] = useState(false);
  const [threadEdit, setThreadEdit] = useState(null);
  // 提示词构建页带回的结构化标签，用于画布顶部的"标签栏"展示。
  const draftTags = Array.isArray(draft.tags) ? draft.tags : [];
  const tagChips = buildTagChips(draftTags);
  const richPromptRef = useRef(null);
  const promptRef = useRef(null);
  const canvasRef = useRef(null);

  async function reloadTaskThreads() {
      try {
        let userId = currentUserId;
        if (!userId) {
          const me = await fetch("/auth/me");
          if (!me.ok) throw new Error("请先登录");
          userId = (await me.json()).userId;
          setCurrentUserId(userId);
        }
        const response = await fetch(`/gen_imgs/threads?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error("无法读取任务列表");
        const threads = await response.json();
        const hydrated = await Promise.all(threads.map(async (thread) => {
          const attemptsResponse = await fetch(`/gen_imgs/threads/${thread.id}/attempts`);
          const attempts = attemptsResponse.ok ? await attemptsResponse.json() : [];
          return mapThread({ ...thread, attempts });
        }));
        setTaskThreads(hydrated);
      } catch (error) { setToast(error.message); }
    }

  useEffect(() => {
    let cancelled = false;
    reloadTaskThreads();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // 创作页的提示词实时同步到全局草稿，供提示词构建页读取同一份内容。
    if (prompt !== draft.prompt) setDraft({ ...draft, prompt });
  }, [prompt]);
  useEffect(() => {
    // 参考图同步到全局草稿（仅内存共享），提示词构建页通过 draft.references 读取。
    setDraft({ ...draft, references: files });
  }, [files]);
  useEffect(() => {
    const editor = richPromptRef.current;
    if (editor && editorPromptText(editor) !== prompt) renderPromptContent(editor, prompt, files);
  }, [prompt, files]);

  useEffect(() => {
    // Thread 的最新 Attempt 进入终态后停止轮询，避免成功后继续请求。
    if (!threadId || status === "done" || status === "failed") return undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/gen_imgs/threads/${threadId}`);
        if (!response.ok) throw new Error("无法读取任务状态");
        const thread = await response.json();
        const latest = thread.attempts?.at(-1);
        // 兼容 Java VO 的驼峰字段和网关透传的下划线字段，并优先展示最新一次成功尝试。
        const completedAttempt = [...(thread.attempts || [])].reverse().find((attempt) => {
          const attemptStatus = String(attempt.status || "").toLowerCase();
          const urls = attempt.imageUrls || attempt.image_urls || [];
          return attemptStatus === "succeeded" && urls.length;
        });
        const imageUrls = completedAttempt?.imageUrls || completedAttempt?.image_urls || latest?.imageUrls || latest?.image_urls || [];
        const latestStatus = String(latest?.status || "pending").toLowerCase();
        setStatus(latestStatus === "succeeded" ? "done" : latestStatus === "failed" ? "failed" : "working");
        if (latestStatus === "failed" && latest?.error) setToast(`生成失败：${latest.error}`);
        setTaskThreads((items) => items.map((item) => {
          if (item.id !== threadId) return item;
          const refreshedItem = mapThread(thread, item.title);
          // 后端不同查询入口的排序可能不同；沿用当前 Attempt 顺序，避免卡片在轮询时跳动。
          const previousIds = item.attempts.map((attempt) => attempt.id);
          const order = new Map(previousIds.map((id, index) => [id, index]));
          refreshedItem.attempts.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
          const previousLabels = new Map(item.attempts.map((attempt) => [attempt.id, attempt.label]));
          let nextNumber = item.attempts.reduce((max, attempt) => Math.max(max, Number(String(attempt.label).replace("#", "")) || 0), 0) + 1;
          refreshedItem.attempts.forEach((attempt) => { attempt.label = previousLabels.get(attempt.id) || `#${String(nextNumber++).padStart(2, "0")}`; });
          return refreshedItem;
        }));
        if (imageUrls.length) {
          const attemptNumber = completedAttempt?.attemptNo ?? completedAttempt?.attempt_no ?? thread.attempts?.length ?? 1;
          setResults(imageUrls.map((url, index) => ({ id: `${threadId}-${index}`, image: url, title: `${mode} · ${index + 1}`, attemptNumber })));
          // 结果落库后重新读取 Thread/Attempt，确保工作区缩略图立即拿到最新 URL。
          await reloadTaskThreads();
        }
      } catch (error) { setToast(error.message); }
    };
    poll(); const timer = setInterval(poll, 1800); return () => clearInterval(timer);
  }, [threadId, status]);

  useGSAP(() => { gsap.fromTo(".studio-grid > *", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.09, duration: 0.75, ease: "power3.out" }); }, { scope: canvasRef });

  function resizePrompt(event) {
    // 让长提示词输入框自动扩展，并限制最大高度。
    const element = event.currentTarget;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }

  function addReferences(fileList) {
    // 添加参考图本地预览，最多保留四张。
    const accepted = Array.from(fileList).filter((file) => file.type.startsWith("image/")).slice(0, 4 - files.length);
    setFiles((items) => [...items, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);
  }

  function dropReferences(event) {
    // 处理拖拽图片上传，并复用统一的参考图添加逻辑。
    event.preventDefault();
    if (event.dataTransfer?.files?.length) addReferences(event.dataTransfer.files);
  }

  function removeReference(id) {
    // 删除参考图并释放浏览器本地预览资源。
    setFiles((items) => { const target = items.find((item) => item.id === id); if (target) URL.revokeObjectURL(target.url); return items.filter((item) => item.id !== id); });
  }

  async function saveThreadTitle() {
    const id = workspaceThreadId || threadId;
    if (!id || !taskName.trim()) return;
    try {
      const response = await fetch(`/gen_imgs/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskName.trim() })
      });
      if (!response.ok) throw new Error("任务名称修改失败");
      setTaskThreads((items) => items.map((item) => item.id === id ? { ...item, title: taskName.trim() } : item));
      setToast("任务名称已更新");
    } catch (error) { setToast(error.message); }
  }

  async function startGeneration() {
    // 创建 Thread；Java 服务会在其中创建首个 Attempt。
    if (!prompt.trim() || !["idle", "failed", "done"].includes(status)) return;
    if (!currentUserId) { setToast("请先登录"); return; }
    if (["failed", "done"].includes(status) && threadId) {
      await retryThread(threadId);
      return;
    }
    const spend = count * (mode === "批量出图" ? 24 : 12);
    if (credits < spend) { setToast("算力不足，请前往个人中心查看权益"); return; }
    const generatedTitle = threadId ? taskName : defaultThreadTitle(taskThreads);
    if (!threadId) setTaskName(generatedTitle);
    const form = new FormData();
    // prompt 字段现在存放结构化提示词 JSON（system_prompt/user_prompt/tags_prompt），由后端解析。
    form.append("prompt", JSON.stringify(buildGenImgsPrompt(prompt.trim(), draftTags, additionalSystemPrompt)));
    form.append("n", String(count));
    form.append("userId", currentUserId);
    form.append("title", generatedTitle);
    form.append("model", draft.model || "gpt-image-2"); form.append("size", normalizeSize(draft.size));
    // 生图服务只接受 auto、low、medium、high；界面“标准”对应 medium。
    form.append("quality", normalizeQuality(draft.quality)); form.append("output_format", "png");
    files.forEach(({ file, url }) => { if (file instanceof File) form.append("reference_images", file); else if (url) form.append("reference_image_urls", url); });
    setStatus("queued"); setResults([]); setDraft({ ...draft, prompt, mode, additionalSystemPrompt }); setCredits(credits - spend);
    try {
      const response = await fetch("/gen_imgs/threads", { method: "POST", body: form });
      if (!response.ok) throw new Error("创建生成任务失败");
      const thread = await response.json(); setThreadId(thread.threadId); setTaskThreads((items) => [mapThread(thread, taskName.trim() || defaultThreadTitle(items)), ...items]); setWorkspaceView("tasks"); setWorkspaceOpen(true);
    } catch (error) { setStatus("failed"); setToast(error.message); }
  }

  async function retryThread(id) {
    if (!currentUserId) { setToast("请先登录"); return; }
    const form = new FormData();
    // prompt 字段现在存放结构化提示词 JSON（system_prompt/user_prompt/tags_prompt），由后端解析。
    form.append("prompt", JSON.stringify(buildGenImgsPrompt(prompt.trim(), draftTags, additionalSystemPrompt)));
    form.append("n", String(count));
    form.append("userId", currentUserId);
    form.append("model", draft.model || "gpt-image-2"); form.append("size", normalizeSize(draft.size));
    // 重试请求使用与首次生成相同的质量参数映射。
    form.append("quality", normalizeQuality(draft.quality)); form.append("output_format", "png");
    files.forEach(({ file, url }) => { if (file instanceof File) form.append("reference_images", file); else if (url) form.append("reference_image_urls", url); });
    setThreadId(id); setResults([]); setStatus("queued");
    try { const response = await fetch(`/gen_imgs/threads/${id}/attempts`, { method: "POST", body: form }); if (!response.ok) throw new Error("重试失败"); const thread = await response.json(); setTaskThreads((items) => items.map((item) => item.id === id ? mapThread(thread, item.title) : item)); } catch (error) { setStatus("failed"); setToast(error.message); }
  }

  function startNewCreation() {
    setThreadId(""); setWorkspaceThreadId(""); setWorkspaceView("tasks"); setPrompt("");
    setFiles([]); setReferencesLocked(false); setResults([]); setStatus("idle");
    setTaskName(defaultThreadTitle(taskThreads)); setEditingTaskName(false);
    // 新建任务同时清空上一次从提示词构建页带回的标签栏内容。
    setDraft({ ...draft, prompt: "", tags: [] });
    setToast("已准备新的创作");
  }

  useEffect(() => {
    // "新建任务"按钮渲染在顶栏（AppShell）中，这里监听事件并调用本页的重置逻辑。
    const handler = () => startNewCreation();
    window.addEventListener("start-new-creation", handler);
    return () => window.removeEventListener("start-new-creation", handler);
  });

  function syncRichPrompt() {
    const element = richPromptRef.current;
    if (!element) return;
    const text = editorPromptText(element);
    setPrompt(text);
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const line = anchor?.textContent?.slice(0, selection.anchorOffset) || "";
    const match = line.match(/@([^\s@]*)$/);
    setMentionOpen(Boolean(match && files.length));
    setMentionQuery(match?.[1] || "");
    setMentionIndex(0);
  }

  const mentionCandidates = files.filter((item) => item.file.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  function insertMention(file) {
    const editor = richPromptRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const text = node.nodeType === Node.TEXT_NODE ? node.textContent : "";
    const before = text.slice(0, range.startOffset);
    const atIndex = before.lastIndexOf("@");
    if (atIndex >= 0 && node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, atIndex);
      range.deleteContents();
    }
    const chip = createMentionChip(file);
    range.insertNode(chip);
    range.setStartAfter(chip); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    setMentionOpen(false);
    syncRichPrompt();
  }

  function handleRichPromptKeyDown(event) {
    if (event.key === "Backspace" && removeAdjacentMention(richPromptRef.current, event.key)) {
      event.preventDefault();
      syncRichPrompt();
      return;
    }
    if (!mentionOpen || !mentionCandidates.length) {
      if (event.key === "Escape") setMentionOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + mentionCandidates.length) % mentionCandidates.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertMention(mentionCandidates[mentionIndex]);
    } else if (event.key === "Escape") {
      setMentionOpen(false);
    }
  }

  return <section className={`create-page ${workspaceOpen ? "has-workspace-rail" : ""} ${(threadId || workspaceThreadId) ? "has-thread" : ""}`} style={{ "--workspace-width": `${workspaceWidth}px` }} ref={canvasRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); }}>
    <div className="create-intro workspace-rail-controls"><button className={`workspace-dock-button ${workspaceOpen ? "is-open" : ""}`} type="button" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((open) => !open)}><span className="dock-glyph"><PanelRight size={15} /></span><span>工作区</span></button><div className="task-name-editor"><input className="task-name-inline" value={taskName} maxLength="40" readOnly={!editingTaskName} onChange={(event) => setTaskName(event.target.value)} onBlur={() => { if (editingTaskName) saveThreadTitle(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); setEditingTaskName(false); } }} aria-label="任务名称" /><button type="button" className="task-name-edit" title={editingTaskName ? "保存任务名称" : "修改任务名称"} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (editingTaskName) { saveThreadTitle(); setEditingTaskName(false); } else setEditingTaskName(true); }}>{editingTaskName ? <Check size={14} /> : <Pencil size={14} />}</button></div></div>
    <div className="studio-grid">
      <section className="creation-controls">
        {/* 参考图、提示词与参数区放入可滚动容器：内容超高时在模块内滚动，避免溢出被页面裁切。 */}
        <div className="control-scroll-area">
        <div className="control-title"><span>参考图</span><small>可选 · 最多 4 张</small></div>
        <div className={`reference-strip ${files.length ? "has-files" : "empty"}`} onDragOver={(event) => !referencesLocked && event.preventDefault()} onDrop={(event) => !referencesLocked && dropReferences(event)}>{files.map((item) => <div className="reference-item" key={item.id}><img src={item.url} alt={item.file.name} /><div className="reference-caption"><span>{item.file.name}</span>{!referencesLocked && <button onClick={() => removeReference(item.id)} title="移除参考图"><X size={13} /></button>}</div></div>)}{files.length < 4 && !referencesLocked && <label className="reference-add"><ImagePlus size={24} /><div><b>{files.length ? "继续添加" : "添加参考图"}</b><small>{files.length ? `${files.length}/4 张` : "点击或拖拽图片到这里"}</small></div><input type="file" accept="image/*" multiple onChange={(event) => addReferences(event.target.files)} /></label>}</div>
        <div className="prompt-editor"><div className="prompt-editor-head"><span>你的构想</span><div><small className="prompt-hint">输入 @ 关联参考图</small><button type="button" onClick={() => navigate("/create/prompt-builder")} title="构建提示词"><Sparkles size={15} /></button></div></div><div ref={richPromptRef} className="rich-prompt" contentEditable suppressContentEditableWarning onInput={syncRichPrompt} onKeyDown={handleRichPromptKeyDown} data-placeholder="写下你的创作构想…" />{mentionOpen && mentionCandidates.length > 0 && <div className="mention-menu"><div className="mention-title">关联参考图 · ↑↓ 选择，Enter 确认</div>{mentionCandidates.map((item, index) => <button type="button" className={index === mentionIndex ? "active" : ""} key={item.id} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); insertMention(item); }}><img src={item.url} alt="" /><span>{referenceLabel(item.file.name)}</span><kbd>{index + 1}</kbd></button>)}</div>}<small className="prompt-count">{prompt.length}/5000</small></div>
        <div className="control-fields"><SelectField label="模型" value={draft.model || "gpt-image-2"} options={["gpt-image-2", "dall-e-3"]} onChange={(value) => setDraft({ ...draft, model: value })} /><SelectField label="尺寸" value={normalizeSize(draft.size)} options={GPT_IMAGE_SIZE_OPTIONS} onChange={(value) => setDraft({ ...draft, size: value })} /><SelectField label="质量" value={normalizeQuality(draft.quality)} options={[{ value: "auto", label: "自动" }, { value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }]} onChange={(value) => setDraft({ ...draft, quality: value })} /><SelectField label="数量" value="1" options={["1"]} disabled /></div>
        </div>
        <div className="control-footer"><button className="plain-button" type="button" onClick={() => setAdvancedOpen(true)}><Settings2 size={15} />高级参数</button><button className="create-button" onClick={startGeneration} disabled={!["idle", "failed", "done"].includes(status) || !prompt.trim()}><WandSparkles size={17} />{status === "idle" || status === "failed" || status === "done" ? (status === "failed" ? "重试" : status === "done" ? "重新生成" : "开始创作") : status === "queued" ? "待生成" : "生成中"}</button></div>
      </section>
      {/* 标签栏：独立于结果显示模块（深色画布）的浅色卡片，固定显示在画布上方。 */}
      <div className="canvas-column">
        <div className="canvas-tag-panel">
          <div className="canvas-tag-head"><span>标签栏</span><small>{draftTags.length ? `${draftTags.length} 个标签` : "暂无标签"}</small></div>
          <div className="canvas-tag-bar">
            {tagChips.length
              ? tagChips.map((text, index) => <span className={`canvas-tag tone-${index % 4}`} key={`${index}-${text}`}>{text}</span>)
              : <span className="canvas-tag-placeholder">在提示词构建页添加标签后，这里会展示对应内容</span>}
          </div>
        </div>
        <section className="creation-canvas">
          <div className="canvas-label"><span>{mode}</span><span>{status === "done" ? "交付完成" : "图像实验室"}</span></div>
        {status === "idle" && !results.length && <div className="canvas-empty"><div className="empty-star"><Sparkles size={23} /></div><h2>在这里等待<br />一个新的视野。</h2><p>填写构想，或者添加一张参考图开始。</p></div>}
        {(status === "queued" || status === "working") && <div className="canvas-empty"><div className="orbit-loader"><span /></div><h2>{status === "queued" ? "灵感正在排队" : "画面正在显影"}</h2><p>{status === "queued" ? "任务将很快开始。" : "模型正在理解光线、构图与细节。"}</p></div>}
        {(status === "done" || results.length > 0) && <div className={`result-gallery count-${results.length}`}>{results.map((result) => <article className="result-image" key={result.id}><button className="result-image-preview" type="button" onClick={() => setPreviewResult(result)} aria-label={`预览${result.title}`}><img src={result.image} alt={result.title} /></button><div><span>{result.title}</span><button type="button" onClick={() => setToast("已收藏到个人画廊")} title="收藏"><Bookmark size={15} /></button><button type="button" onClick={() => downloadResultImage(result.image, `${safeDownloadName(taskName)}-${result.attemptNumber || 1}.png`)} title="下载"><Download size={15} /></button></div></article>)}</div>}
        <div className="canvas-status"><span>状态：{status === "queued" ? "待生成" : status === "working" ? "生成中" : status === "done" ? "已生成" : status === "failed" ? "失败" : "待生成"}</span><span>消耗 {count * 12} 算力 · {files.length ? `${files.length} 张参考图已就绪` : "无需参考图"}</span></div>
        </section>
      </div>
    </div>
    {workspaceOpen && <UnifiedWorkspace view={workspaceView} onViewChange={setWorkspaceView} threads={taskThreads} thread={taskThreads.find((item) => item.id === workspaceThreadId) || taskThreads.find((item) => item.id === threadId) || taskThreads[0]} width={workspaceWidth} onResize={setWorkspaceWidth} onClose={() => setWorkspaceOpen(false)} onRetry={retryThread} onEditThread={(item) => setThreadEdit({ id: item.id, title: item.title })} onSelectThread={(item) => { setWorkspaceThreadId(item.id); setTaskName(item.title); setEditingTaskName(false); setWorkspaceView("results"); }} onSelectAttempt={(attempt, selectedThread) => { setThreadId(selectedThread.id); setWorkspaceThreadId(selectedThread.id); setPrompt(attempt.prompt || ""); setDraft({ ...draft, prompt: attempt.prompt || "", model: attempt.modelName || draft.model, size: attempt.size || draft.size, quality: attempt.quality || draft.quality }); setFiles((selectedThread.references || []).map((reference, index) => ({ id: `stored-ref-${index}`, url: reference.url || reference.objectKey || reference, file: { name: reference.filename || `参考图 ${index + 1}`, type: reference.mimeType || "image/*" } }))); setReferencesLocked(true); setResults((attempt.imageUrls || []).map((url, index) => ({ id: `${attempt.id}-${index}`, image: url, title: `${mode} · ${index + 1}`, version: "初稿", attemptNumber: attempt.attemptNo || selectedThread.attempts.findIndex((item) => item.id === attempt.id) + 1 }))); setStatus(attempt.rawStatus === "succeeded" || (attempt.imageUrls || []).length ? "done" : attempt.rawStatus === "failed" ? "failed" : attempt.rawStatus === "running" ? "working" : "queued"); }} />}
    {threadEdit && <Modal title="修改任务名称" onClose={() => setThreadEdit(null)}><div className="template-form"><label>任务名称<input autoFocus maxLength="40" value={threadEdit.title} onChange={(event) => setThreadEdit({ ...threadEdit, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.closest("form")?.requestSubmit(); }} /></label><button type="button" className="primary-action" disabled={!threadEdit.title.trim()} onClick={async () => { try { const response = await fetch(`/gen_imgs/threads/${threadEdit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: threadEdit.title.trim() }) }); if (!response.ok) throw new Error("任务名称修改失败"); setTaskThreads((items) => items.map((item) => item.id === threadEdit.id ? { ...item, title: threadEdit.title.trim() } : item)); if (workspaceThreadId === threadEdit.id) setTaskName(threadEdit.title.trim()); setThreadEdit(null); setToast("任务名称已更新"); } catch (error) { setToast(error.message); } }}>保存</button></div></Modal>}
    {promptFullscreen && <PromptFullscreen value={prompt} files={files} onChange={setPrompt} onClose={() => setPromptFullscreen(false)} />}
    {advancedOpen && <AdvancedPromptModal value={additionalSystemPrompt} basePrompt={GEN_IMGS_SYSTEM_PROMPT} onChange={setAdditionalSystemPrompt} onClose={() => setAdvancedOpen(false)} onSave={() => { setDraft({ ...draft, additionalSystemPrompt }); setAdvancedOpen(false); setToast("系统提示词追加内容已保存"); }} />}
    {previewResult && <ImagePreview result={previewResult} filename={`${safeDownloadName(taskName)}-${previewResult.attemptNumber || 1}.png`} onClose={() => setPreviewResult(null)} onDownload={() => downloadResultImage(previewResult.image, `${safeDownloadName(taskName)}-${previewResult.attemptNumber || 1}.png`)} />}
  </section>;
}

export function ImagePreview({ result, filename, onClose, onDownload }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef(null);
  useEffect(() => { const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [onClose]);
  function updateScale(next) { setScale(Math.min(4, Math.max(.5, next))); }
  function onPointerDown(event) { event.currentTarget.setPointerCapture(event.pointerId); dragOrigin.current = { x: event.clientX - position.x, y: event.clientY - position.y }; setDragging(true); }
  function onPointerMove(event) { if (dragging && dragOrigin.current) setPosition({ x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y }); }
  function stopDragging() { setDragging(false); dragOrigin.current = null; }
  return <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label="图片预览" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="image-preview-toolbar"><span>{filename}</span><div><button type="button" onClick={() => updateScale(scale - .25)} title="缩小">−</button><b>{Math.round(scale * 100)}%</b><button type="button" onClick={() => updateScale(scale + .25)} title="放大">+</button><button type="button" onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} title="重置">↺</button>{onDownload && <button type="button" onClick={onDownload} title="下载"><Download size={17} /></button>}<button type="button" onClick={onClose} title="关闭"><X size={18} /></button></div></div><div className={`image-preview-stage ${dragging ? "is-dragging" : ""}`} onWheel={(event) => { event.preventDefault(); updateScale(scale + (event.deltaY > 0 ? -.1 : .1)); }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}><img src={result.image} alt={result.title} style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }} draggable="false" /></div><p className="image-preview-hint">滚轮缩放 · 拖动查看 · Esc 关闭</p></div>;
}

function AdvancedPromptModal({ value, basePrompt, onChange, onClose, onSave }) {
  return <Modal title="高级参数" onClose={onClose}><div className="advanced-prompt-form"><label><span>原始系统提示词</span><textarea value={basePrompt} readOnly /></label><label><span>追加系统提示词</span><textarea autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="例如：画面保持极简构图，使用柔和自然光。" /></label><p>你填写的内容会追加到原始系统提示词之后，不会覆盖原提示词。</p><button className="primary-action" onClick={onSave}>保存设置</button></div></Modal>;
}

function UnifiedWorkspace({ view, onViewChange, threads, thread, width, onResize, onClose, onRetry, onEditThread, onSelectThread, onSelectAttempt }) {
  return <aside className="unified-rail" style={{ width }} aria-label="工作区"><div className="unified-resizer" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(280, Math.min(560, initial + start - e.clientX))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} /><header className="unified-header">{view === "results" && <button className="workspace-back icon-only" type="button" onClick={() => onViewChange("tasks")} aria-label="返回任务" title="返回任务"><ArrowRight size={15} /></button>}<div className="workspace-heading"><span>WORKSPACE</span><h2>工作区</h2></div><button className="workspace-close" type="button" onClick={onClose} title="关闭工作区"><X size={18} /></button></header><div className="unified-content">{view === "tasks" ? <TaskDrawer embedded threads={threads} onClose={onClose} onRetry={onRetry} onEditThread={onEditThread} onSelectThread={onSelectThread} /> : <AttemptDrawer embedded thread={thread} onClose={onClose} onRetry={onRetry} onSelectAttempt={(attempt) => onSelectAttempt?.(attempt, thread)} />}</div></aside>;
}

function TaskDrawer({ threads, width, onResize, onClose, onEditThread, onSelectThread, embedded = false }) {
  const [expanded, setExpanded] = useState(threads[0]?.id);
  const [selectedAttempt, setSelectedAttempt] = useState(threads[0]?.attempts.at(-1)?.id);
  const selectedThread = threads.find((thread) => thread.id === expanded) || threads[0];
  const attempt = selectedThread?.attempts.find((item) => item.id === selectedAttempt) || selectedThread?.attempts.at(-1);
  useEffect(() => { if (threads[0]?.id) { setExpanded(threads[0].id); setSelectedAttempt(threads[0].attempts.at(-1)?.id); } }, [threads]);
  return <aside className={`task-drawer ${embedded ? "embedded-drawer" : "task-rail"}`} style={embedded ? undefined : { width }} aria-label="生成任务">{!embedded && <div className="rail-resizer" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(220, Math.min(520, initial + e.clientX - start))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} />}<div className="task-drawer-body"><nav className="thread-list" aria-label="Thread 列表">{threads.length ? threads.map((thread) => <div className={`thread-card ${thread.id === selectedThread?.id ? "selected" : ""}`} key={thread.id}><button className="thread-card-main" type="button" onClick={() => { setExpanded(thread.id); setSelectedAttempt(thread.attempts.at(-1)?.id); onSelectThread?.(thread); }}><span className="thread-icon">{thread.thumbnail ? <img src={thread.thumbnail} alt="" /> : <Layers3 size={15} />}</span><span className="thread-info"><b>{thread.title}</b><small>{thread.createdAt}</small></span><span className={`thread-status status-${thread.status}`}>{thread.status}</span></button><button className="thread-edit" type="button" title="修改任务名称" aria-label={`修改任务名称：${thread.title}`} onClick={(event) => { event.stopPropagation(); onEditThread?.(thread); }}><Pencil size={14} /></button></div>) : <div className="empty-task-state"><Layers3 size={18} /><strong>还没有任务</strong><span>完成一次创作后，任务会显示在这里。</span></div>}</nav>{selectedThread && <section className="attempt-detail"><div className="detail-kicker">{selectedThread.title}</div><h3>{attempt?.label}</h3><p className="detail-status">{attempt?.status}</p><div className="detail-progress"><span style={{ width: `${attempt?.progress || 0}%` }} /></div><dl><div><dt>提示词</dt><dd>{getPromptExcerpt(selectedThread.title, 80)}</dd></div><div><dt>模型</dt><dd>gpt-image-2</dd></div><div><dt>创建时间</dt><dd>{selectedThread.createdAt}</dd></div></dl><div className="attempt-history"><span>执行记录</span>{selectedThread.attempts.map((item) => <button className={item.id === attempt?.id ? "active" : ""} key={item.id} type="button" onClick={() => setSelectedAttempt(item.id)}><b>{item.label}</b><em>{item.status}</em></button>)}</div><button className="retry-button" type="button" onClick={() => onRetry(selectedThread.id)}><RotateCw size={13} />重试</button></section>}</div></aside>;
}

function AttemptDrawer({ thread, width, onResize, onClose, onRetry, onSelectAttempt, embedded = false }) {
  if (!thread) return null;
  return <aside className={`attempt-rail task-drawer ${embedded ? "embedded-drawer" : ""}`} style={embedded ? undefined : { width }} aria-label="Attempt 结果">{!embedded && <div className="rail-resizer rail-resizer-left" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(240, Math.min(520, initial + start - e.clientX))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} />}<div className="attempt-rail-body"><p className="detail-kicker">{thread.title}</p>{thread.attempts.map((attempt) => <button className="attempt-rail-item" type="button" key={attempt.id} onClick={() => onSelectAttempt?.(attempt)}><div><b>{attempt.label}</b><span>{attempt.status}</span></div>{attempt.imageUrls?.[0] && <img src={attempt.imageUrls[0]} alt="结果缩略图" />}</button>)}</div></aside>;
}

function PromptFullscreen({ value, files, onChange, onClose }) {
  // 全屏编辑器沿用页面内的 @ 参考图关联格式，避免长提示词编辑时丢失该能力。
  const editorRef = useRef(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionCandidates = files.filter((item) => item.file.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editorPromptText(editor) !== value) renderPromptContent(editor, value, files);
  }, [value, files]);

  function updateMention() {
    // 只检查光标当前行，避免正文中较早的 @ 影响正在输入的位置。
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const currentLine = anchor?.nodeType === Node.TEXT_NODE ? anchor.textContent.slice(0, selection.anchorOffset).split("\n").at(-1) || "" : "";
    const match = currentLine.match(/@([^\s@]*)$/);
    setMentionOpen(Boolean(match && files.length));
    setMentionQuery(match?.[1] || "");
    setMentionIndex(0);
  }

  function syncFullscreenPrompt() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editorPromptText(editor));
    updateMention();
  }

  function insertMention(file) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const text = node.nodeType === Node.TEXT_NODE ? node.textContent : "";
    const atIndex = text.slice(0, range.startOffset).lastIndexOf("@");
    if (atIndex < 0 || node.nodeType !== Node.TEXT_NODE) return;
    range.setStart(node, atIndex);
    range.deleteContents();
    const chip = createMentionChip(file);
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    setMentionOpen(false);
    syncFullscreenPrompt();
  }

  function handleKeyDown(event) {
    if (event.key === "Backspace" && removeAdjacentMention(editorRef.current, event.key)) {
      event.preventDefault();
      syncFullscreenPrompt();
      return;
    }
    if (!mentionOpen || !mentionCandidates.length) {
      if (event.key === "Escape") setMentionOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + mentionCandidates.length) % mentionCandidates.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertMention(mentionCandidates[mentionIndex]);
    } else if (event.key === "Escape") {
      setMentionOpen(false);
    }
  }

  return <div className="prompt-fullscreen" role="dialog" aria-modal="true"><div className="prompt-fullscreen-panel"><header><div><span>提示词编辑</span><small>{value.length}/5000</small></div><button type="button" onClick={onClose} title="关闭全屏"><X size={19} /></button></header><div className="prompt-fullscreen-editor"><div ref={editorRef} className="fullscreen-rich-prompt" contentEditable suppressContentEditableWarning onInput={syncFullscreenPrompt} onKeyDown={handleKeyDown} data-placeholder="写下你的创作构想…" autoFocus />{mentionOpen && mentionCandidates.length > 0 && <div className="fullscreen-mention-menu"><div className="mention-title">关联参考图 · ↑↓ 选择，Enter 确认</div>{mentionCandidates.map((item, index) => <button type="button" className={index === mentionIndex ? "active" : ""} key={item.id} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); insertMention(item); }}><img src={item.url} alt="" /><span>{referenceLabel(item.file.name)}</span><kbd>{index + 1}</kbd></button>)}</div>}</div><footer><span>输入 @ 可关联参考图，支持长提示词编辑。</span><button type="button" className="primary-action" onClick={onClose}>完成</button></footer></div></div>;
}

function getPromptExcerpt(prompt, maxLength = 96) {
  // 将可能很长的提示词压缩为卡片列表适用的一段摘要。
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

export function PromptsPage() {
  // 提供模板筛选、收藏、发布和反向提示词模拟功能。
  const { prompts, togglePrompt, addPrompt, updatePrompt, deletePrompt, setDraft, setToast } = useStore();
  const navigate = useNavigate();
  const [source, setSource] = useState("全部"); const [category, setCategory] = useState("全部"); const [query, setQuery] = useState(""); const [reverseOpen, setReverseOpen] = useState(false); const [newOpen, setNewOpen] = useState(false); const [selectedPrompt, setSelectedPrompt] = useState(null);
  const list = prompts.filter((item) => (source === "全部" || item.source === source) && (category === "全部" || item.category === category) && `${item.title}${item.prompt}${item.tags.join("")}`.toLowerCase().includes(query.toLowerCase()));
  function usePrompt(item) { // 将完整提示词带入创作工作台。
    setDraft({ prompt: item.prompt, model: "gpt-image-2", size: "auto", quality: "auto", mode: "文本生图" }); navigate("/create"); setToast("提示词已带入创作工作台");
  }
  return <section className="content-page prompt-page"><PageHeading title={<>提示词库</>} description="收藏、整理、复用。" action={<button className="primary-action" onClick={() => setNewOpen(true)}><Plus size={16} />新建模板</button>} />
    <div className="prompt-utility"><div className="search-box"><Search size={17} /><input placeholder="搜索标题、风格、标签" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-row">{["全部", "官方", "社区", "我的"].map((item) => <button className={source === item ? "active" : ""} onClick={() => setSource(item)} key={item}>{item}</button>)}</div></div>
    <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? "chosen" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="prompt-layout"><div className="prompt-grid">{list.map((item) => <article className="prompt-card" key={item.id}><img src={item.cover} alt="" /><div className="prompt-card-body"><div className="card-overline"><span>{item.source} · {item.category}</span><button onClick={() => togglePrompt(item.id)} className={item.saved ? "saved" : ""} title={item.saved ? "取消收藏" : "收藏模板"}><Bookmark size={16} fill={item.saved ? "currentColor" : "none"} /></button></div><h3>{item.title}</h3><p className="prompt-preview">{getPromptExcerpt(item.prompt)}</p><div className="prompt-card-meta"><span>{item.prompt.length} 字</span><div className="tag-list">{item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="card-actions"><button onClick={() => setSelectedPrompt(item)}>查看全文</button><button onClick={() => usePrompt(item)}><Copy size={14} />套用</button>{item.source === "我的" && <button onClick={() => updatePrompt(item.id, { source: "社区" })}>发布</button>}{item.source === "社区" && <button onClick={() => updatePrompt(item.id, { source: "我的" })}>撤回</button>}{item.source === "我的" && <button onClick={() => deletePrompt(item.id)} title="删除模板"><Trash2 size={14} /></button>}</div></div></article>)}</div>
      <aside className="reverse-prompt"><Palette size={22} /><h2>从图像里，读出它的语言。</h2><p>上传一张作品，模拟 AI 会拆开主体、镜头、光线、风格与参数。</p><button onClick={() => setReverseOpen(true)}>解析一张图片 <ArrowRight size={15} /></button></aside></div>
    {selectedPrompt && <PromptDetailModal item={selectedPrompt} onClose={() => setSelectedPrompt(null)} onUse={() => usePrompt(selectedPrompt)} />}
    {reverseOpen && <ReverseModal onClose={() => setReverseOpen(false)} onUse={(text) => { setDraft({ prompt: text, model: "gpt-image-2", size: "auto", quality: "auto", mode: "图生图" }); navigate("/create"); }} onSave={(text) => { addPrompt({ title: "从作品拆解", category: "插画", tags: ["反向解析", "编辑感"], prompt: text, cover: image("reverse-template") }); setReverseOpen(false); setToast("已保存为我的模板"); }} />}
    {newOpen && <TemplateModal onClose={() => setNewOpen(false)} onSave={(template) => { addPrompt(template); setNewOpen(false); setToast("模板已保存"); }} />}
  </section>;
}

function PromptDetailModal({ item, onClose, onUse }) {
  // 在独立阅读面板中展示长提示词，避免它挤占模板列表空间。
  return <Modal title={item.title} onClose={onClose}><section className="prompt-detail"><div className="prompt-detail-head"><img src={item.cover} alt="" /><div><span>{item.source} · {item.category}</span><h2>{item.title}</h2><div className="tag-list">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><div className="long-prompt-reader"><div><span>完整提示词</span><small>{item.prompt.length} 字</small></div><p>{item.prompt}</p></div><div className="prompt-detail-actions"><button className="secondary-action" onClick={onClose}>返回列表</button><button className="primary-action" onClick={onUse}><Copy size={15} />套用到创作</button></div></section></Modal>;
}

function ReverseModal({ onClose, onUse, onSave }) {
  // 展示反向解析生成的结构化提示词结果。
  const [ready, setReady] = useState(false); const [preview, setPreview] = useState(null); const result = "主体：雨后玻璃花房与透明椅子。构图：低机位、中心留白、纵向画幅。风格：编辑摄影结合柔软油画肌理。光线：阴天漫射光，微弱高光。色彩：苔藓绿、雾蓝与灰白。";
  function upload(file) { if (!file) return; setPreview(URL.createObjectURL(file)); setReady(false); setTimeout(() => setReady(true), 1200); }
  return <Modal title="解析作品提示词" onClose={onClose}><div className="reverse-modal">{!preview ? <label className="analysis-upload"><UploadCloud size={26} /><b>上传一张作品</b><span>AI 将从画面中提取可复用的创作语言</span><input type="file" accept="image/*" onChange={(event) => upload(event.target.files[0])} /></label> : <><img className="analysis-preview" src={preview} alt="上传预览" />{!ready ? <div className="analysis-wait"><div className="orbit-loader"><span /></div>正在拆解视觉层次</div> : <div className="analysis-result"><span>解析结果</span><p>{result}</p><div><button className="secondary-action" onClick={() => onSave(result)}>保存模板</button><button className="primary-action" onClick={() => onUse(result)}>带入创作</button></div></div>}</>}</div></Modal>;
}

function TemplateModal({ onClose, onSave }) {
  // 收集用户输入后创建本地提示词模板。
  const [title, setTitle] = useState(""); const [prompt, setPrompt] = useState("");
  return <Modal title="新建提示词模板" onClose={onClose}><div className="template-form"><label>模板名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给它一个好记的名字" /></label><label>提示词<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="写下可复用的画面语言" /></label><label>分类<select><option>插画</option><option>头像</option><option>海报</option></select></label><button className="primary-action" disabled={!title || !prompt} onClick={() => onSave({ title, prompt, category: "插画", tags: ["自定义"], cover: image(title) })}>保存模板</button></div></Modal>;
}

export function LibraryPage() {
  // 展示已沉淀的个人作品与收藏灵感，不在此处处理生成任务。
  const { library, works, setDraft, setToast } = useStore(); const navigate = useNavigate(); const [tab, setTab] = useState("我的作品"); const [selected, setSelected] = useState(null);
  const creationWorks = library.filter((item) => item.status === "已完成").map((item) => ({ ...item, origin: "我的创作" }));
  const savedInspiration = works.filter((work) => work.saved).map((work) => ({ ...work, id: `saved-${work.id}`, status: "已收藏", origin: "社区灵感", createdAt: `收藏自 ${work.author}`, versions: ["收藏快照"] }));
  const tabItems = { "我的作品": creationWorks, "收藏灵感": savedInspiration };
  const display = tabItems[tab];
  function continueWork(item) { // 使用当前作品的提示词和模型参数继续创作。
    setDraft({ prompt: item.prompt, model: item.model, size: "auto", quality: "auto", mode: "图生图" }); navigate("/create"); setToast("已从此版本继续创作");
  }
  return <section className="content-page library-page"><PageHeading title={<>我的画廊</>} description="沉淀作品与收藏的灵感。" action={<button className="primary-action" onClick={() => navigate("/create")}><Plus size={16} />继续创作</button>} />
    <div className="library-tabs">{["我的作品", "收藏灵感"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
    <div className="library-context"><span>{tab === "收藏灵感" ? "保留作品、作者与参数快照" : "已完成的创作作品与版本记录"}</span><b>{display.length} 项</b></div>
    <div className="library-area"><div className="archive-grid">{display.length ? display.map((item) => <article className="archive-card" key={item.id} onClick={() => setSelected(item)}><img src={item.image} alt={item.title} /><div className="archive-info"><span>{item.status} · {item.origin}</span><h3>{item.title}</h3><p>{item.createdAt}</p></div></article>) : <div className="library-empty"><Sparkles size={23} /><strong>这里还没有内容</strong><span>{tab === "收藏灵感" ? "去灵感社区收藏喜欢的作品。" : "完成一次创作后，作品会保存在这里。"}</span><button onClick={() => navigate(tab === "收藏灵感" ? "/community" : "/create")}>{tab === "收藏灵感" ? "去看灵感" : "去创作"} <ArrowRight size={14} /></button></div>}</div><aside className="archive-notes"><span>云端空间</span><strong>18.4 <i>GB</i></strong><div className="storage-bar"><span /></div><p>已使用 46% 存储空间</p><button onClick={() => navigate("/profile")}>管理空间 <ArrowRight size={14} /></button></aside></div>
    {selected && <WorkModal item={selected} onClose={() => setSelected(null)} onContinue={() => continueWork(selected)} onToast={setToast} />}
  </section>;
}

function WorkModal({ item, onClose, onContinue, onToast }) {
  // 展示作品的版本时间线和导出入口。
  const [version, setVersion] = useState(item.versions[item.versions.length - 1]);
  return <Modal title={item.title} onClose={onClose}><div className="work-modal"><img src={item.image} alt={item.title} /><div className="work-inspector"><span>{item.model}</span><p>{item.prompt}</p><h3>版本时间线</h3><div className="version-list">{item.versions.map((name) => <button key={name} className={version === name ? "current" : ""} onClick={() => setVersion(name)}><span />{name}</button>)}</div><div className="export-row"><button onClick={() => onToast("已准备原图下载")}><Download size={15} />原图</button><button onClick={() => onToast("高清图为 VIP 权益")}><Star size={15} />高清图</button><button onClick={() => onToast("已导出带水印版本")}><FileImage size={15} />带水印</button></div><button className="primary-action full" onClick={onContinue}>从此版本继续创作</button></div></div></Modal>;
}

export function CommunityPage() {
  // 提供作品社区浏览、互动、评论与一键复刻体验。
  const { works, toggleWork, addComment, following, setFollowing, setDraft, setToast } = useStore(); const navigate = useNavigate(); const [category, setCategory] = useState("全部"); const [selected, setSelected] = useState(null); const root = useRef(null);
  const list = category === "全部" ? works : works.filter((item) => item.category === category);
  useGSAP(() => { const cards = gsap.utils.toArray(".feed-card"); gsap.fromTo(cards, { opacity: 0.25, scale: 0.9 }, { opacity: 1, scale: 1, stagger: 0.08, scrollTrigger: { trigger: ".community-feed", start: "top 80%", end: "bottom 65%", scrub: 0.8 } }); }, { scope: root });
  function remix(work) { setDraft({ prompt: work.prompt, model: work.model, size: work.size, mode: "图生图" }); navigate("/create"); setToast("已复制整套参数，可直接开始创作"); }
  return <section className="content-page community-page" ref={root}><PageHeading eyebrow="DISCOVER" title={<>灵感</>} description="看见喜欢的，带去继续创作。" action={<button className="primary-action" onClick={() => navigate("/create")}><WandSparkles size={16} />去创作</button>} />
    <section className="community-bento"><article className="bento-hero" onClick={() => setSelected(works[0])}><img src={works[0].image} alt="" /><div><span>本周精选</span><h2>{works[0].title}</h2><p>来自 {works[0].author} 的公开作品</p></div></article><article className="bento-prompt"><span>可以被复刻的画面</span><p>“{works[1].prompt.slice(0, 36)}...”</p><button onClick={() => remix(works[1])}>带走这套参数 <ArrowRight size={15} /></button></article><article className="bento-event"><span>正在进行</span><strong>#手机壁纸</strong><p>1,284 份灵感正在生长</p></article><article className="bento-creator"><img src={works[2].avatar} alt="" /><div><b>{works[2].author}</b><span>把夜色做成海报的人</span></div><button onClick={() => setFollowing((items) => items.includes(works[2].authorId) ? items.filter((id) => id !== works[2].authorId) : [...items, works[2].authorId])}>{following.includes(works[2].authorId) ? "已关注" : "关注"}</button></article></section>
    <div className="community-filter"><div>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="sort-button">热门 <ChevronDown size={14} /></button></div>
    <section className="community-feed"><aside><span>作品会因为<br />新的观看方式<br />重新活一次。</span></aside><div className="feed-grid">{list.map((work) => <article className="feed-card" key={work.id}><button className="image-hit" onClick={() => setSelected(work)}><img src={work.image} alt={work.title} /></button><div className="feed-meta"><div><img src={work.avatar} alt="" /><span>{work.author}</span></div><button onClick={() => toggleWork(work.id, "liked")} className={work.liked ? "liked" : ""}><Heart size={15} fill={work.liked ? "currentColor" : "none"} />{formatNumber(work.likes)}</button></div><h3>{work.title}</h3><div className="feed-actions"><button onClick={() => remix(work)}><Copy size={14} />复刻同款</button><button onClick={() => toggleWork(work.id, "saved")}><Bookmark size={14} fill={work.saved ? "currentColor" : "none"} /></button></div></article>)}</div></section>
    {selected && <CommunityModal work={selected} onClose={() => setSelected(null)} onRemix={() => remix(selected)} />}
  </section>;
}

function CommunityModal({ work, onClose, onRemix }) {
  // 展示社区作品详情，并允许本地评论、收藏和关注。
  const { toggleWork, addComment, following, setFollowing, setToast } = useStore(); const [comment, setComment] = useState("");
  function sendComment() { if (!comment.trim()) return; addComment(work.id, comment.trim()); setComment(""); setToast("评论已发布"); }
  return <Modal title="作品详情" onClose={onClose}><div className="community-modal"><img src={work.image} alt={work.title} /><div className="community-detail"><div className="detail-author"><img src={work.avatar} alt="" /><div><b>{work.author}</b><span>公开发布</span></div><button onClick={() => setFollowing((items) => items.includes(work.authorId) ? items.filter((id) => id !== work.authorId) : [...items, work.authorId])}>{following.includes(work.authorId) ? "已关注" : "关注"}</button></div><h2>{work.title}</h2><p>{work.prompt}</p><div className="parameter-line"><span>{work.model}</span><span>{work.size}</span></div><div className="detail-buttons"><button onClick={() => toggleWork(work.id, "liked")}><Heart size={15} fill={work.liked ? "currentColor" : "none"} />{formatNumber(work.likes)}</button><button onClick={() => toggleWork(work.id, "saved")}><Bookmark size={15} fill={work.saved ? "currentColor" : "none"} />收藏</button></div><button className="primary-action full" onClick={onRemix}><Copy size={16} />复刻同款</button><div className="comments"><h3>{work.comments.length} 条评论</h3>{work.comments.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}<div><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="写下你的回应" /><button onClick={sendComment}><Send size={15} /></button></div></div></div></div></Modal>;
}

export function ProfilePage() {
  // 展示演示账户的积分、权益、设置和版权说明。
  const { credits, settings, setSettings, library } = useStore(); const [tab, setTab] = useState("概览");
  const entries = [{ label: "高清出图", amount: "-48", date: "今天 09:42" }, { label: "批量创作", amount: "-96", date: "昨天 18:16" }, { label: "新用户体验包", amount: "+300", date: "08.18" }];
  return <section className="content-page profile-page"><PageHeading eyebrow="ACCOUNT" title={<>我的账户</>} description="算力、权限与记录。" />
    <div className="profile-tabs">{["概览", "隐私设置", "版权说明"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
    {tab === "概览" && <><section className="account-lead"><div className="account-person"><img src={image("creator-avatar", 180, 180)} alt="" /><div><span>创作者</span><h2>漫游的树</h2><p>作品公开 18 · 收藏 46 · 已加入 3 个活动</p></div></div><div className="credit-balance"><span>可用算力</span><strong>{credits.toLocaleString()}</strong><p>本月已使用 1,620</p><button>获取算力包 <ArrowRight size={15} /></button></div></section><section className="profile-columns"><div className="ledger"><h2>近期算力记录</h2>{entries.map((item) => <div key={item.date + item.label}><span>{item.label}</span><small>{item.date}</small><b className={item.amount.startsWith("+") ? "income" : ""}>{item.amount}</b></div>)}</div><div className="membership"><span>MindScribe Plus</span><h2>更快的队列，<br />更大的想象空间。</h2><ul><li><Check size={15} />高速生成队列</li><li><Check size={15} />高清无水印导出</li><li><Check size={15} />100GB 创作存储空间</li></ul><button className="primary-action">查看 Plus 方案</button></div></section></>}
    {tab === "隐私设置" && <section className="settings-panel">{[["public", "作品默认公开", "公开后可在灵感广场被发现"], ["remix", "允许他人复刻", "复刻时会带入你的模型参数"], ["revealPrompt", "展示提示词", "他人可查看并学习你的创作语言"], ["downloads", "允许下载", "社区用户可下载公开作品的带水印版本"]].map(([key, title, copy]) => <label className="toggle-row" key={key}><div><b>{title}</b><span>{copy}</span></div><input type="checkbox" checked={settings[key]} onChange={() => setSettings({ ...settings, [key]: !settings[key] })} /><i /></label>)}</section>}
    {tab === "版权说明" && <section className="copyright-panel"><div><span>个人使用</span><h2>你生成的作品，属于你的创作记录。</h2><p>可用于个人社交分享、作品展示和非商业项目。含有他人素材的作品应获得相应授权。</p></div><div><span>商业使用</span><h2>请在商用前确认素材与模型条款。</h2><p>商业项目需遵守所选模型与参考素材的使用许可；平台不替代版权审查。</p></div><div><span>社区分享</span><h2>公开是邀请，不是放弃署名。</h2><p>你可随时关闭复刻、提示词展示和下载权限，历史收藏不会改变原作品归属。</p></div></section>}
  </section>;
}

function PageHeading({ title, description, action }) {
  // 渲染统一的页面标题和行动入口。
  return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-side">{action}</div>}</header>;
}

function Modal({ title, children, onClose }) {
  // 以通用遮罩承载详情、编辑和解析界面。
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

export default LegacyApp;





