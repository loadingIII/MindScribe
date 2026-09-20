import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, Clock3, Copy, Download, Pencil,
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

/** 从 Attempt 保存的结构化提示词中恢复标签；旧文本提示词返回空数组。 */
function attemptTags(value, fallback) {
  try {
    const data = JSON.parse(String(value || ""));
    const tags = data?.tags_prompt || fallback;
    if (!Array.isArray(tags)) return [];
    return tags
      .map((tag) => ({
        key: String(tag?.tag_name || "").trim(),
        value: String(tag?.tag_value || "").trim()
      }))
      .filter((tag) => tag.key);
  } catch {
    return [];
  }
}

/** 判断草稿标签是否仍与某次 Attempt 的快照一致。 */
function sameTags(left, right) {
  const normalize = (tags) => (Array.isArray(tags) ? tags : [])
    .map((tag) => ({
      key: String(tag?.key || "").trim(),
      value: String(tag?.value || "").trim()
    }));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

// 格式化 Attempt 创建时间；缺失或无效值统一显示"暂无"。
function formatAttemptCreatedAt(value) {
  if (value === null || value === undefined || value === "") return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value) || "暂无";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).replace(/\//g, "-");
}

// 任务线程与尝试记录的统一视图映射。
function mapThread(thread, title) {
  // 兼容 Java/MySQL 返回的驼峰、下划线字段，以及历史记录中的 JSON 字符串。
  const rawReferences = thread.referenceImages ?? thread.reference_images ?? thread.references ?? [];
  const references = typeof rawReferences === "string" ? (() => {
    try { return JSON.parse(rawReferences); } catch { return []; }
  })() : (Array.isArray(rawReferences) ? rawReferences : []);
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
      modelName: item.modelName || item.model_name || item.model || "",
      prompt: readablePrompt(item.prompt),
      tags: attemptTags(item.prompt, item.tagsPrompt || item.tags_prompt),
      size: item.size,
      quality: item.quality || item.imageQuality || item.image_quality || "",
      createdAt: item.createdAt ?? item.created_at ?? item.createTime ?? item.create_time ?? "",
      error: item.error || "",
      label: `#${String(index + 1).padStart(2, "0")}`,
      status: statusText(status),
      rawStatus: status,
      progress: status === "succeeded" ? 100 : 24
    };
  });
  const normalizedReferences = references
    .map((reference) => {
      if (typeof reference === "string") return reference;
      if (!reference || typeof reference !== "object") return null;
      return {
        ...reference,
        url: reference.url || reference.imageUrl || reference.image_url || reference.objectKey || reference.object_key
      };
    })
    .filter((reference) => typeof reference === "string" || reference?.url);
  return { id: thread.threadId || thread.id, title: title || thread.title || thread.prompt || "未命名创作", prompt: thread.prompt || "", status: attempts.at(-1)?.status || statusText(thread.status), createdAt: thread.createdAt || "刚刚", thumbnail: normalizedReferences[0]?.url || normalizedReferences[0]?.objectKey || normalizedReferences[0], references: normalizedReferences, attempts };
}

// 将提示词构建页带回的标签转换为标签栏芯片数据：参考图标记解析为独立段，每个标签独立限制 20 字符。
// 单个标签在标签栏的最大展示字符数（按显示文本计算，参考图标记按图片名计）。
const TAG_CHIP_MAX = 23;

/** 把标签值拆为文本段与参考图段：[序号:图片名] 识别为参考图段，仅保留图片名用于展示。 */
function splitTagSegments(value) {
  const source = String(value || "");
  const segments = [];
  const pattern = /\[\d+:([^\]]+)\]/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > last) segments.push({ type: "text", text: source.slice(last, match.index) });
    segments.push({ type: "ref", text: match[1] });
    last = match.index + match[0].length;
  }
  if (last < source.length) segments.push({ type: "text", text: source.slice(last) });
  return segments;
}

/** 在剩余字符预算内截断标签片段；参考图片段的 text 就是 filename，因此按文件名计数。 */
function truncateTagSegment(segment, remain) {
  if (segment.text.length <= remain) return segment;
  if (remain <= 0) return null;
  if (remain <= 3) {
    return { type: segment.type, text: ".".repeat(remain) };
  }
  return {
    type: segment.type,
    text: `${segment.text.slice(0, remain - 3)}...`
  };
}

/** 构建标签栏芯片：每个标签独立计算 20 字符预算（不再共享总预算），超限时在当前段内截断并追加省略号。 */
function buildTagChips(tags) {
  return tags.map((tag) => {
    const key = String(tag?.key || "").trim();
    const value = String(tag?.value || "").trim();
    // 键名作为首个文本段参与预算；无值时仅展示键名。
    const segments = value
      ? [{ type: "text", text: `${key}：` }, ...splitTagSegments(value)]
      : [{ type: "text", text: key }];
    const list = [];
    let used = 0;
    for (const segment of segments) {
      const remain = TAG_CHIP_MAX - used;
      if (remain <= 0) break;
      if (segment.text.length <= remain) {
        list.push(segment);
        used += segment.text.length;
        continue;
      }
      // 当前段超出剩余预算：文本段或参考图名均就地截断并追加省略号。
      const truncated = truncateTagSegment(segment, remain);
      if (truncated) list.push(truncated);
      break;
    }
    return {
      segments: list,
      // 悬浮提示保留标签的完整原始内容，不受视觉截断影响。
      fullText: value ? `${key}：${value}` : key
    };
  });
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
import { loadCachedReferences, saveCachedReferences, useCachedState, useStore, normalizeModel } from "../../store/AppStore";
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
  // 历史 Attempt 的参考图是远程 URL；刷新后根据草稿中的可序列化元数据恢复为同一数据结构。
  const [files, setFiles] = useCachedState("create:files", () => (draft.references || []).map((item, index) => ({
    id: item.id || `restored-ref-${index}`,
    url: item.url || item,
    file: {
      name: item.file?.name || item.name || `参考图 ${index + 1}`,
      type: item.file?.type || item.type || "image/*"
    }
  })));
  const [referencesRestored, setReferencesRestored] = useState(false);
  const [referencesLocked, setReferencesLocked] = useCachedState("create:referencesLocked", false);
  const count = 1;
  const [status, setStatus] = useCachedState("create:status", "idle");
  const [threadId, setThreadId] = useCachedState("create:threadId", "");
  const [attemptId, setAttemptId] = useCachedState("create:attemptId", "");
  const [results, setResults] = useCachedState("create:results", []);
  // 标签栏折叠状态单独缓存，便于在创作页与提示词构建页之间切换时保持当前视图。
  const [tagsCollapsed, setTagsCollapsed] = useCachedState("create:tagsCollapsed", false);
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
  const [threadPage, setThreadPage] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadHasMore, setThreadHasMore] = useState(true);
  const [attemptPages, setAttemptPages] = useState({});
  const [currentUserId, setCurrentUserId] = useState(CONFIGURED_USER_ID);
  const [taskName, setTaskName] = useCachedState("create:taskName", () => defaultThreadTitle());
  const [editingTaskName, setEditingTaskName] = useState(false);
  const [threadEdit, setThreadEdit] = useState(null);
  const [templatePublishOpen, setTemplatePublishOpen] = useState(false);
  // 提示词构建页带回的结构化标签，用于画布顶部的"标签栏"展示。
  const draftTags = Array.isArray(draft.tags) ? draft.tags : [];
  const tagChips = buildTagChips(draftTags);
  const richPromptRef = useRef(null);
  const promptRef = useRef(null);
  const canvasRef = useRef(null);
  // 任务失败时只提示一次，轮询不会重复弹出同一条错误。
  const failedAttemptRef = useRef("");

  async function reloadTaskThreads() {
      try {
        let userId = currentUserId;
        if (!userId) {
          const me = await fetch("/auth/me");
          if (!me.ok) throw new Error("请先登录");
          userId = (await me.json()).userId;
          setCurrentUserId(userId);
        }
        const response = await fetch(`/gen_imgs/threads?page=0&size=10`);
        if (!response.ok) throw new Error("无法读取任务列表");
        const threads = await response.json();
        const hydrated = threads.map((thread) => mapThread({ ...thread, attempts: [] }));
        setTaskThreads(hydrated);
        setThreadPage(0);
        setThreadHasMore(threads.length === 10);
        
        // 刷新后从缓存状态恢复当前线程及所选 Attempt，避免丢失工作进度。
        if (threadId) {
          console.log("[恢复] threadId:", threadId, "当前 taskName:", taskName);
          console.log("[恢复] 线程列表:", hydrated.map(t => ({ id: t.id, title: t.title })));
          const currentThread = hydrated.find((item) => item.id === threadId);
          if (currentThread) {
            console.log("[恢复] 找到线程:", currentThread.title);
            // 恢复任务名称
            setTaskName(currentThread.title);
            
            // 加载该线程的完整 Attempt 列表
            try {
              const attemptsResponse = await fetch(`/gen_imgs/threads/${threadId}/attempts?page=0&size=10`);
              if (attemptsResponse.ok) {
                const attempts = await attemptsResponse.json();
                const mappedThread = mapThread({ ...currentThread, attempts });
                const updatedThreads = hydrated.map((t) => t.id === threadId ? mappedThread : t);
                setTaskThreads(updatedThreads);
                
                // 优先恢复缓存的 attemptId，否则使用最新的 Attempt
                const targetAttempt = attemptId
                  ? mappedThread.attempts.find((item) => item.id === attemptId)
                  : mappedThread.attempts.at(-1);
                
                if (targetAttempt) {
                  console.log("[恢复] 恢复 Attempt:", targetAttempt.id, "状态:", targetAttempt.rawStatus);
                  // 恢复 Attempt 的完整状态：提示词、标签、参数和结果图
                  setAttemptId(targetAttempt.id);
                  // 只有当前 draft.prompt 和 draft.tags 为空时才恢复服务器的数据，避免覆盖用户刚从提示词构建页编辑的内容。
                  const shouldRestorePrompt = !draft.prompt || draft.prompt === targetAttempt.prompt;
                  const shouldRestoreTags = !draft.tags || draft.tags.length === 0;
                  if (shouldRestorePrompt) {
                    setPrompt(targetAttempt.prompt || "");
                  }
                  setDraft((current) => ({
                    ...current,
                    prompt: shouldRestorePrompt ? (targetAttempt.prompt || "") : current.prompt,
                    tags: shouldRestoreTags ? (targetAttempt.tags || []) : current.tags,
                    model: normalizeModel(targetAttempt.modelName || current.model),
                    size: targetAttempt.size || current.size,
                    quality: targetAttempt.quality || current.quality,
                    references: mappedThread.references || []
                  }));
                  
                  const restoredStatus = targetAttempt.rawStatus === "succeeded" || targetAttempt.imageUrls.length
                    ? "done"
                    : targetAttempt.rawStatus === "failed" ? "failed" 
                    : targetAttempt.rawStatus === "running" ? "working" : "queued";
                  console.log("[恢复] 设置状态:", restoredStatus, "图片数量:", targetAttempt.imageUrls.length);
                  setStatus(restoredStatus);
                  
                  setResults(targetAttempt.imageUrls.map((url, index) => ({
                    id: `${targetAttempt.id}-${index}`,
                    image: url,
                    title: `${mode} · ${index + 1}`,
                    version: "初稿",
                    attemptNumber: targetAttempt.attemptNo
                  })));
                }
              }
            } catch (error) {
              console.error("恢复 Attempt 状态失败:", error);
            }
          } else {
            // 找不到对应的线程，说明可能已被删除，清除缓存状态
            console.warn("[恢复] 未找到 threadId 对应的线程，清除缓存状态");
            setThreadId("");
            setAttemptId("");
          }
        }
      } catch (error) { setToast(error.message); }
    }

  useEffect(() => {
    let cancelled = false;
    reloadTaskThreads();
    return () => { cancelled = true; };
  }, []);

  // 与 AppShell 顶栏通信：同步任务名称、工作区状态和发布按钮状态
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("topbar-task-name-update", { 
      detail: { taskName } 
    }));
  }, [taskName]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("topbar-workspace-state", { 
      detail: { open: workspaceOpen } 
    }));
  }, [workspaceOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("topbar-publish-state", { 
      detail: { canPublish: prompt.trim().length > 0 } 
    }));
  }, [prompt]);

  useEffect(() => {
    const handleSaveTaskName = (event) => {
      const newName = event.detail.taskName;
      if (newName && newName !== taskName) {
        setTaskName(newName);
        if (workspaceThreadId) {
          saveThreadTitle();
        }
      }
    };

    const handleToggleWorkspace = (event) => {
      setWorkspaceOpen(event.detail.open);
    };

    const handleOpenPublishModal = () => {
      setTemplatePublishOpen(true);
    };

    window.addEventListener("topbar-save-task-name", handleSaveTaskName);
    window.addEventListener("topbar-toggle-workspace", handleToggleWorkspace);
    window.addEventListener("topbar-open-publish-modal", handleOpenPublishModal);

    return () => {
      window.removeEventListener("topbar-save-task-name", handleSaveTaskName);
      window.removeEventListener("topbar-toggle-workspace", handleToggleWorkspace);
      window.removeEventListener("topbar-open-publish-modal", handleOpenPublishModal);
    };
  }, [taskName, workspaceThreadId, prompt]);

  useEffect(() => {
    // 创作页的提示词实时同步到全局草稿，供提示词构建页读取同一份内容。
    if (prompt !== draft.prompt) setDraft((current) => ({ ...current, prompt }));
  }, [prompt]);
  useEffect(() => {
    // 提示词构建页保存后，全局草稿的 prompt 会更新，需反向同步到创作页的本地状态。
    console.log("[CreatePage] useEffect[draft.prompt] - draft.prompt:", draft.prompt);
    console.log("[CreatePage] useEffect[draft.prompt] - 当前 prompt:", prompt);
    if (draft.prompt !== prompt) {
      console.log("[CreatePage] useEffect[draft.prompt] - 触发同步，更新为:", draft.prompt);
      setPrompt(draft.prompt);
    }
  }, [draft.prompt]);
  useEffect(() => {
    // 参考图同步到全局草稿（仅内存共享），提示词构建页通过 draft.references 读取。
    setDraft((current) => ({ ...current, references: files }));
  }, [files]);
  useEffect(() => {
    // 页面刷新后从 IndexedDB 恢复本地参考图，并重新建立可显示的 Object URL。
    let cancelled = false;
    loadCachedReferences()
      .then((items) => {
        if (cancelled || files.length || !items.length) return;
        setFiles(items.map((item) => ({ id: item.id, file: item.file, url: URL.createObjectURL(item.file) })));
      })
      .catch(() => setToast("参考图恢复失败，请重新添加"))
      .finally(() => { if (!cancelled) setReferencesRestored(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    // 仅在恢复完成后写入，避免首帧空数组覆盖已有的本地参考图。
    if (!referencesRestored) return;
    saveCachedReferences(files).catch(() => setToast("参考图保存失败，请减少图片大小"));
  }, [files, referencesRestored]);
  useEffect(() => {
    const editor = richPromptRef.current;
    if (editor && editorPromptText(editor) !== prompt) renderPromptContent(editor, prompt, files);
  }, [prompt, files]);

  useEffect(() => {
    // 仅轮询当前选中的 Attempt，避免新任务回显旧 Attempt 的结果。
    if (!threadId || !attemptId || status === "done" || status === "failed") return undefined;
    // 记录轮询开始时间，超过 90 秒未完成则自动标记为超时失败。
    const startTime = Date.now();
    const TIMEOUT_MS = 90000;
    const poll = async () => {
      try {
        // 检查是否超时：超过 90 秒且状态还在运行中，标记为超时失败并停止轮询。
        const elapsed = Date.now() - startTime;
        if (elapsed > TIMEOUT_MS && (status === "queued" || status === "working")) {
          setStatus("failed");
          if (failedAttemptRef.current !== attemptId) {
            failedAttemptRef.current = attemptId;
            setToast("生成超时：任务未在 90 秒内完成，请稍后重试");
          }
          return;
        }
        const response = await fetch(`/gen_imgs/threads/${threadId}`);
        if (!response.ok) throw new Error("无法读取任务状态");
        const thread = await response.json();
        const currentAttempt = (thread.attempts || []).find((item) => (
          (item.attemptId || item.attempt_id || item.id) === attemptId
        ));
        if (!currentAttempt) return;

        const imageUrls = currentAttempt.imageUrls || currentAttempt.image_urls || [];
        const currentStatus = String(currentAttempt.status || "pending").toLowerCase();
        const nextStatus = currentStatus === "succeeded"
          ? "done"
          : currentStatus === "failed" ? "failed" : "working";
        setStatus(nextStatus);
        if (currentStatus === "failed" && currentAttempt.error && failedAttemptRef.current !== attemptId) {
          failedAttemptRef.current = attemptId;
          setToast(`生成失败：${currentAttempt.error}`);
        }
        setTaskThreads((items) => {
          let changed = false;
          const nextItems = items.map((item) => {
            if (item.id !== threadId) return item;
            // 状态接口只返回 Attempt，不一定携带 Thread 的参考图；保留本地已知的参考图。
            const refreshedItem = mapThread({ ...thread, referenceImages: item.references }, item.title);
            const previousAttempt = (item.attempts || []).find((attempt) => attempt.id === attemptId);
            const refreshedAttempt = refreshedItem.attempts.find((attempt) => attempt.id === attemptId);
            // 状态、结果和错误均未变化时保留原对象，避免工作区在每次轮询时重新渲染。
            if (previousAttempt && refreshedAttempt
              && previousAttempt.rawStatus === refreshedAttempt.rawStatus
              && previousAttempt.error === refreshedAttempt.error
              && JSON.stringify(previousAttempt.imageUrls) === JSON.stringify(refreshedAttempt.imageUrls)) {
              return item;
            }
            changed = true;
            return refreshedItem;
          });
          return changed ? nextItems : items;
        });
        const attemptNumber = currentAttempt.attemptNo ?? currentAttempt.attempt_no ?? 1;
        const nextResults = imageUrls.map((url, index) => ({
          id: `${attemptId}-${index}`,
          image: url,
          title: `${mode} · ${index + 1}`,
          attemptNumber
        }));
        setResults((previous) => (
          JSON.stringify(previous) === JSON.stringify(nextResults) ? previous : nextResults
        ));
      } catch (error) { setToast(error.message); }
    };
    poll(); const timer = setInterval(poll, 1800); return () => clearInterval(timer);
  }, [attemptId, threadId, status]);

  useGSAP(() => { gsap.fromTo(".studio-grid > *", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.09, duration: 0.75, ease: "power3.out" }); }, { scope: canvasRef });

  function resizePrompt(event) {
    // 让长提示词输入框自动扩展，并限制最大高度。
    const element = event.currentTarget;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }

  async function loadMoreThreads() {
    if (threadLoading || !threadHasMore || !currentUserId) return;
    setThreadLoading(true);
    try {
      const nextPage = threadPage + 1;
      const response = await fetch(`/gen_imgs/threads?page=${nextPage}&size=10`);
      if (!response.ok) throw new Error("无法读取更多任务");
      const rows = await response.json();
      setTaskThreads((items) => [...items, ...rows.map((thread) => mapThread({ ...thread, attempts: [] }))]);
      setThreadPage(nextPage);
      setThreadHasMore(rows.length === 10);
    } catch (error) { setToast(error.message); } finally { setThreadLoading(false); }
  }

  async function selectThread(item) {
    setWorkspaceThreadId(item.id);
    setThreadId(item.id);
    setTaskName(item.title);
    setEditingTaskName(false);
    setWorkspaceView("results");
    if ((item.attempts || []).length) return;
    try {
      const response = await fetch(`/gen_imgs/threads/${item.id}/attempts?page=0&size=10`);
      if (!response.ok) throw new Error("无法读取执行记录");
      const attempts = await response.json();
      const mapped = mapThread({ ...item, attempts });
      setTaskThreads((items) => items.map((current) => current.id === item.id ? mapped : current));
      setAttemptPages((pages) => ({ ...pages, [item.id]: 0 }));
      if (mapped.attempts.length) selectAttempt(mapped.attempts.at(-1), mapped);
    } catch (error) { setToast(error.message); }
  }

  async function loadMoreAttempts(item) {
    if (!item || !(item.attempts || []).length) return;
    const page = (attemptPages[item.id] ?? 0) + 1;
    const response = await fetch(`/gen_imgs/threads/${item.id}/attempts?page=${page}&size=10`);
    if (!response.ok) return;
    const rows = await response.json();
    const mappedRows = mapThread({ ...item, attempts: rows }).attempts;
    setTaskThreads((items) => items.map((current) => current.id === item.id
      ? { ...current, attempts: [...(current.attempts || []), ...mappedRows].sort((a, b) => a.attemptNo - b.attemptNo) } : current));
    setAttemptPages((pages) => ({ ...pages, [item.id]: page }));
  }

  function addReferences(fileList) {
    // 添加参考图本地预览，最多保留四张。
    const accepted = Array.from(fileList).filter((file) => file.type.startsWith("image/")).slice(0, 4 - files.length);
    if (!accepted.length) return;
    const additions = accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    const next = [...files, ...additions];
    // 选择图片时立即持久化，而不是等待 React 副作用，避免刷新恰好发生在异步写入前。
    saveCachedReferences(next).catch(() => setToast("参考图保存失败，请减少图片大小"));
    setFiles(next);
  }

  function dropReferences(event) {
    // 处理拖拽图片上传，并复用统一的参考图添加逻辑。
    event.preventDefault();
    if (event.dataTransfer?.files?.length) addReferences(event.dataTransfer.files);
  }

  function removeReference(id) {
    // 删除参考图并释放浏览器本地预览资源。
    const target = files.find((item) => item.id === id);
    if (target?.url?.startsWith("blob:")) URL.revokeObjectURL(target.url);
    const next = files.filter((item) => item.id !== id);
    saveCachedReferences(next).catch(() => setToast("参考图保存失败，请稍后重试"));
    setFiles(next);
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
    // 没有 Thread 才是首次创作；已有任务统一追加 Attempt，避免误建新 Thread。
    if (!prompt.trim() || !["idle", "failed", "done"].includes(status)) return;
    if (!currentUserId) { setToast("请先登录"); return; }
    if (threadId && (status === "failed" || status === "done")) {
      await retryThread(threadId);
      return;
    }
    const spend = count * (mode === "批量出图" ? 24 : 12);
    if (credits < spend) { setToast("算力不足，请前往个人中心查看权益"); return; }
    const generatedTitle = defaultThreadTitle(taskThreads);
    setTaskName(generatedTitle);
    const form = new FormData();
    // prompt 字段现在存放结构化提示词 JSON（system_prompt/user_prompt/references/tags_prompt），由后端解析。
    form.append("prompt", JSON.stringify(buildGenImgsPrompt(prompt.trim(), draftTags, additionalSystemPrompt, files)));
    form.append("n", String(count));
    form.append("title", generatedTitle);
    form.append("model", draft.model || "gpt-image-2"); form.append("size", normalizeSize(draft.size));
    // 生图服务只接受 auto、low、medium、high；界面"标准"对应 medium。
    form.append("quality", normalizeQuality(draft.quality)); form.append("outputFormat", "png");
    // multipart 表单字段使用 Java DTO 的属性名，避免 @ModelAttribute 无法绑定下划线字段。
    files.forEach(({ file, url }) => { if (file instanceof File) form.append("referenceImages", file); else if (url) form.append("referenceImageUrls", url); });
    // 主按钮总是开启新 Thread；先清空旧结果并展开工作区，避免请求期间展示旧任务。
    failedAttemptRef.current = "";
    setStatus("queued");
    setResults([]);
    setAttemptId("");
    setThreadId("");
    setWorkspaceThreadId("");
    setWorkspaceView("results");
    setWorkspaceOpen(true);
    setDraft({ ...draft, prompt, mode, additionalSystemPrompt });
    setCredits(credits - spend);
    try {
      const response = await fetch("/gen_imgs/threads", { method: "POST", body: form });
      if (!response.ok) {
        // 解析后端返回的错误响应体，优先展示具体错误信息而非通用消息。
        const errorData = await response.json().catch(() => null);
        const message = errorData?.message || "创建生成任务失败";
        throw new Error(message);
      }
      const thread = await response.json();
      const newThread = mapThread(thread, generatedTitle);
      const newAttempt = newThread.attempts.at(-1);
      setThreadId(newThread.id);
      setWorkspaceThreadId(newThread.id);
      setAttemptId(newAttempt?.id || "");
      setTaskThreads((items) => [newThread, ...items]);
    } catch (error) { setStatus("failed"); setToast(error.message); }
  }

  async function retryThread(id) {
    if (!currentUserId) { setToast("请先登录"); return; }
    const form = new FormData();
    // prompt 字段现在存放结构化提示词 JSON（system_prompt/user_prompt/references/tags_prompt），由后端解析。
    form.append("prompt", JSON.stringify(buildGenImgsPrompt(prompt.trim(), draftTags, additionalSystemPrompt, files)));
    form.append("n", String(count));
    form.append("model", draft.model || "gpt-image-2"); form.append("size", normalizeSize(draft.size));
    // 重试请求使用与首次生成相同的质量参数映射。
    form.append("quality", normalizeQuality(draft.quality)); form.append("outputFormat", "png");
    const selectedThread = taskThreads.find((item) => item.id === id);
    const latestAttempt = selectedThread?.attempts?.at(-1);
    // 失败时本地文件可能尚未上传，保留文件资源；成功后只复用已落库的 OSS URL。
    if (latestAttempt?.rawStatus === "succeeded") {
      (selectedThread.references || []).forEach((reference) => {
        const url = reference?.url || reference?.objectKey || reference;
        if (url) form.append("referenceImageUrls", url);
      });
    } else {
      files.forEach(({ file, url }) => {
        if (file instanceof File) form.append("referenceImages", file);
        else if (url) form.append("referenceImageUrls", url);
      });
    }
    failedAttemptRef.current = "";
    setThreadId(id); setWorkspaceThreadId(id); setWorkspaceView("results"); setWorkspaceOpen(true);
    setResults([]); setStatus("queued");
    try {
      const response = await fetch(`/gen_imgs/threads/${id}/attempts`, {
        method: "POST",
        body: form
      });
      if (!response.ok) {
        // 解析后端返回的错误响应体，优先展示具体错误信息而非通用消息。
        const errorData = await response.json().catch(() => null);
        const message = errorData?.message || "重试失败";
        throw new Error(message);
      }
      const thread = await response.json();
      const existingThread = taskThreads.find((item) => item.id === id);
      const refreshedThread = mapThread({ ...thread, referenceImages: existingThread?.references || [] }, existingThread?.title);
      const latestAttempt = refreshedThread.attempts.at(-1);
      setTaskThreads((items) => items.map((item) => item.id === id ? refreshedThread : item));
      // 重试成功后只更新 Attempt ID 和清空结果，不覆盖当前的 prompt（用户可能刚从提示词构建页编辑过）。
      if (latestAttempt) {
        setAttemptId(latestAttempt.id);
        setResults([]);
      }
    } catch (error) { setStatus("failed"); setToast(error.message); }
  }

  function startNewCreation() {
    setThreadId(""); setWorkspaceThreadId(""); setWorkspaceView("tasks"); setPrompt("");
    saveCachedReferences([]).catch(() => setToast("参考图清理失败，请稍后重试"));
    setFiles([]); setReferencesLocked(false); setResults([]); setStatus("idle");
    setTaskName(defaultThreadTitle(taskThreads)); setEditingTaskName(false);
    setAttemptId(""); // 清空 Attempt ID，避免保留旧任务的执行记录引用
    // 新建任务同时清空上一次从提示词构建页带回的标签栏内容。
    setDraft({ ...draft, prompt: "", tags: [], references: [] });
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

  // 选择历史 Attempt 时同步恢复创作参数、标签、参考图和结果。
  function selectAttempt(attempt, selectedThread) {
    if (!attempt || !selectedThread) return;
    const restoredReferences = (selectedThread.references || []).map((reference, index) => ({
      id: `stored-ref-${index}`,
      url: reference.url || reference.objectKey || reference,
      file: {
        name: reference.filename || `参考图 ${index + 1}`,
        type: reference.mimeType || "image/*"
      }
    }));
    setThreadId(selectedThread.id);
    setAttemptId(attempt.id);
    setWorkspaceThreadId(selectedThread.id);
    setPrompt(attempt.prompt || "");
    setDraft((current) => ({
      ...current,
      prompt: attempt.prompt || "",
      tags: attempt.tags || [],
      model: normalizeModel(attempt.modelName || current.model),
      size: attempt.size || current.size,
      quality: attempt.quality || current.quality,
      references: restoredReferences
    }));
    setFiles(restoredReferences);
    setReferencesLocked(true);
    setResults((attempt.imageUrls || []).map((url, index) => ({
      id: `${attempt.id}-${index}`,
      image: url,
      title: `${mode} · ${index + 1}`,
      version: "初稿",
      attemptNumber: attempt.attemptNo || selectedThread.attempts.findIndex((item) => item.id === attempt.id) + 1
    })));
    setStatus(attempt.rawStatus === "succeeded" || (attempt.imageUrls || []).length
      ? "done"
      : attempt.rawStatus === "failed" ? "failed"
        : attempt.rawStatus === "running" ? "working" : "queued");
  }

  return <section className={`create-page ${workspaceOpen ? "has-workspace-rail" : ""} ${(threadId || workspaceThreadId) ? "has-thread" : ""}`} style={{ "--workspace-width": `${workspaceWidth}px` }} ref={canvasRef} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); }}>
    <div className="studio-grid">
      <section className="creation-controls">
        {/* 参考图、提示词与参数区放入可滚动容器：内容超高时在模块内滚动，避免溢出被页面裁切。 */}
        <div className="control-scroll-area">
        <div className="control-title"><span>参考图</span><small>可选 · 最多 4 张</small></div>
        <div className={`reference-strip ${files.length ? "has-files" : "empty"}`} onDragOver={(event) => !referencesLocked && event.preventDefault()} onDrop={(event) => !referencesLocked && dropReferences(event)}>{files.map((item) => <div className="reference-item" key={item.id}><img src={item.url} alt={item.file.name} /><div className="reference-caption"><span>{item.file.name}</span>{!referencesLocked && <button onClick={() => removeReference(item.id)} title="移除参考图"><X size={13} /></button>}</div></div>)}{files.length < 4 && !referencesLocked && <label className="reference-add"><ImagePlus size={24} /><div><b>{files.length ? "继续添加" : "添加参考图"}</b><small>{files.length ? `${files.length}/4 张` : "点击或拖拽图片到这里"}</small></div><input type="file" accept="image/*" multiple onChange={(event) => addReferences(event.target.files)} /></label>}</div>
        <div className="prompt-editor"><div className="prompt-editor-head"><span>你的构想</span><div><small className="prompt-hint">输入 @ 关联参考图</small><button className="prompt-builder-trigger" type="button" onClick={() => navigate("/create/prompt-builder")} title="构建提示词"><Sparkles size={14} /><span>构建提示词</span></button></div></div><div ref={richPromptRef} className="rich-prompt" contentEditable suppressContentEditableWarning onInput={syncRichPrompt} onKeyDown={handleRichPromptKeyDown} data-placeholder="写下你的创作构想…" />{mentionOpen && mentionCandidates.length > 0 && <div className="mention-menu"><div className="mention-title">关联参考图 · ↑↓ 选择，Enter 确认</div>{mentionCandidates.map((item, index) => <button type="button" className={index === mentionIndex ? "active" : ""} key={item.id} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); insertMention(item); }}><img src={item.url} alt="" /><span>{referenceLabel(item.file.name)}</span><kbd>{index + 1}</kbd></button>)}</div>}<small className="prompt-count">{prompt.length}/5000</small></div>
        <div className="control-fields"><SelectField label="模型" value={draft.model || "gpt-image-2"} options={["gpt-image-2"]} onChange={(value) => setDraft({ ...draft, model: value })} /><SelectField label="尺寸" value={normalizeSize(draft.size)} options={GPT_IMAGE_SIZE_OPTIONS} onChange={(value) => setDraft({ ...draft, size: value })} /><SelectField label="质量" value={normalizeQuality(draft.quality)} options={[{ value: "auto", label: "自动" }, { value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }]} onChange={(value) => setDraft({ ...draft, quality: value })} /><SelectField label="数量" value="1" options={["1"]} disabled /></div>
        </div>
        <div className="control-footer"><button className="plain-button" type="button" onClick={() => setAdvancedOpen(true)}><Settings2 size={15} />高级参数</button><button className="create-button" onClick={startGeneration} disabled={!["idle", "failed", "done"].includes(status) || !prompt.trim()}><WandSparkles size={17} />{status === "idle" || status === "failed" || status === "done" ? (status === "failed" ? "重试" : status === "done" ? "重新生成" : "开始创作") : status === "queued" ? "待生成" : "生成中"}</button></div>
      </section>
      {/* 标签栏：独立于结果显示模块（深色画布）的浅色卡片，固定显示在画布上方。 */}
      <div className="canvas-column">
        <div className={["canvas-tag-panel", tagsCollapsed && "is-collapsed"].filter(Boolean).join("  ")}>
          <div className="canvas-tag-head">
            <span>标签栏</span>
            <div className="canvas-tag-actions">
              <small>{draftTags.length ? draftTags.length + " 个标签" : "暂无标签"}</small>
              <button type="button" className="canvas-tag-toggle" aria-expanded={!tagsCollapsed} aria-label={tagsCollapsed ? "展开标签栏" : "收起标签栏"} title={tagsCollapsed ? "展开标签栏" : "收起标签栏"} onClick={() => setTagsCollapsed((collapsed) => !collapsed)}><ChevronDown size={14} /></button>
            </div>
          </div>
          <div className="canvas-tag-bar">
            {tagChips.length
              ? <>
                {tagChips.slice(0, tagsCollapsed ? 3 : tagChips.length).map((chip, index) => <span className={`canvas-tag tone-${index % 4}`} key={index} title={chip.fullText} aria-label={chip.fullText}>{chip.segments.map((segment, part) => segment.type === "ref"
                  ? <span className="tag-ref-chip" key={part}>{segment.text}</span>
                  : <span key={part}>{segment.text}</span>)}</span>)}
                {tagsCollapsed && tagChips.length > 3 && <span className="canvas-tag tone-more">+{tagChips.length - 3}</span>}
              </>
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
    {workspaceOpen && <UnifiedWorkspace
      view={workspaceView}
      onViewChange={setWorkspaceView}
      threads={taskThreads}
      thread={taskThreads.find((item) => item.id === workspaceThreadId)
        || taskThreads.find((item) => item.id === threadId)}
      width={workspaceWidth}
      onResize={setWorkspaceWidth}
      onClose={() => setWorkspaceOpen(false)}
      onRetry={retryThread}
      onEditThread={(item) => setThreadEdit({ id: item.id, title: item.title })}
      onSelectThread={selectThread}
      onLoadMoreThreads={loadMoreThreads}
      onLoadMoreAttempts={loadMoreAttempts}
      onSelectAttempt={selectAttempt}
    />}
    {threadEdit && <Modal title="修改任务名称" onClose={() => setThreadEdit(null)}><div className="template-form"><label>任务名称<input autoFocus maxLength="40" value={threadEdit.title} onChange={(event) => setThreadEdit({ ...threadEdit, title: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.closest("form")?.requestSubmit(); }} /></label><button type="button" className="primary-action" disabled={!threadEdit.title.trim()} onClick={async () => { try { const response = await fetch(`/gen_imgs/threads/${threadEdit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: threadEdit.title.trim() }) }); if (!response.ok) throw new Error("任务名称修改失败"); setTaskThreads((items) => items.map((item) => item.id === threadEdit.id ? { ...item, title: threadEdit.title.trim() } : item)); if (workspaceThreadId === threadEdit.id) setTaskName(threadEdit.title.trim()); setThreadEdit(null); setToast("任务名称已更新"); } catch (error) { setToast(error.message); } }}>保存</button></div></Modal>}
    {templatePublishOpen && (
      <TemplatePublishModal
        onClose={() => setTemplatePublishOpen(false)}
        prompt={prompt}
        tags={draftTags}
        coverImages={results.map((result) => result.image)}
        referenceSlots={files.map((item, index) => ({ slotKey: `reference_${index + 1}`, label: item.file?.name || `参考图${index + 1}`, required: false, maxCount: 1 }))}
        modelDefaults={{ model: draft.model || "gpt-image-2", mode: draft.mode || "文本生图" }}
      />
    )}
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

function UnifiedWorkspace({ view, onViewChange, threads, thread, width, onResize, onClose, onRetry, onEditThread, onSelectThread, onSelectAttempt, onLoadMoreThreads, onLoadMoreAttempts }) {
  return <aside className="unified-rail" style={{ width }} aria-label="工作区"><div className="unified-resizer" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(280, Math.min(560, initial + start - e.clientX))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} /><header className="unified-header">{view === "results" && <button className="workspace-back icon-only" type="button" onClick={() => onViewChange("tasks")} aria-label="返回任务" title="返回任务"><ArrowRight size={15} /></button>}<div className="workspace-heading"><span>WORKSPACE</span><h2>工作区</h2></div><button className="workspace-close" type="button" onClick={onClose} title="关闭工作区"><X size={18} /></button></header><div className="unified-content">{view === "tasks" ? <TaskDrawer embedded threads={threads} onClose={onClose} onRetry={onRetry} onEditThread={onEditThread} onSelectThread={onSelectThread} onSelectAttempt={onSelectAttempt} onLoadMoreThreads={onLoadMoreThreads} onLoadMoreAttempts={onLoadMoreAttempts} /> : <AttemptDrawer embedded thread={thread} onClose={onClose} onRetry={onRetry} onSelectAttempt={(attempt) => onSelectAttempt?.(attempt, thread)} />}</div></aside>;
}

function TaskDrawer({ threads, width, onResize, onClose, onRetry, onEditThread, onSelectThread, onSelectAttempt, onLoadMoreThreads, onLoadMoreAttempts, embedded = false }) {
  const safeThreads = (threads || []).map((thread) => ({ ...thread, attempts: thread.attempts || [] }));
  const [expanded, setExpanded] = useState(safeThreads[0]?.id);
  const [selectedAttempt, setSelectedAttempt] = useState(safeThreads[0]?.attempts.at(-1)?.id);
  const selectedThread = safeThreads.find((thread) => thread.id === expanded) || safeThreads[0];
  const attempt = (selectedThread?.attempts || []).find((item) => item.id === selectedAttempt)
    || (selectedThread?.attempts || []).at(-1);
  useEffect(() => {
    if (safeThreads[0]?.id) {
      setExpanded(safeThreads[0].id);
      setSelectedAttempt(safeThreads[0].attempts.at(-1)?.id);
    }
  }, [threads]);
  return <aside className={`task-drawer ${embedded ? "embedded-drawer" : "task-rail"}`} style={embedded ? undefined : { width }} aria-label="生成任务">{!embedded && <div className="rail-resizer" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(220, Math.min(520, initial + e.clientX - start))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} />}<div className="task-drawer-body"><nav className="thread-list" aria-label="Thread 列表" onScroll={(event) => { const target = event.currentTarget; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) onLoadMoreThreads?.(); }}>{safeThreads.length ? safeThreads.map((thread) => <div className={`thread-card ${thread.id === selectedThread?.id ? "selected" : ""}`} key={thread.id}><button className="thread-card-main" type="button" onClick={() => { setExpanded(thread.id); setSelectedAttempt(thread.attempts.at(-1)?.id); onSelectThread?.(thread); }}><span className="thread-icon">{thread.thumbnail ? <img src={thread.thumbnail} alt="" /> : <Layers3 size={15} />}</span><span className="thread-info"><b>{thread.title}</b><small>{thread.createdAt}</small></span><span className={`thread-status status-${thread.status}`}>{thread.status}</span></button><button className="thread-edit" type="button" title="修改任务名称" aria-label={`修改任务名称：${thread.title}`} onClick={(event) => { event.stopPropagation(); onEditThread?.(thread); }}><Pencil size={14} /></button></div>) : <div className="empty-task-state"><Layers3 size={18} /><strong>还没有任务</strong><span>完成一次创作后，任务会显示在这里。</span></div>}</nav>{selectedThread && <section className="attempt-detail" onScroll={(event) => { const target = event.currentTarget; if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) onLoadMoreAttempts?.(selectedThread); }}><div className="detail-kicker">{selectedThread.title}</div><h3>{attempt?.label}</h3><p className="detail-status">{attempt?.status}</p><div className="detail-progress"><span style={{ width: `${attempt?.progress || 0}%` }} /></div><dl><div><dt>提示词</dt><dd>{getPromptExcerpt(attempt?.prompt, 80) || "暂无"}</dd></div><div><dt>模型</dt><dd>{attempt?.modelName || "暂无"}</dd></div><div><dt>质量</dt><dd>{attempt?.quality || "暂无"}</dd></div><div><dt>创建时间</dt><dd>{formatAttemptCreatedAt(attempt?.createdAt)}</dd></div></dl><div className="attempt-history"><span>执行记录</span>{selectedThread.attempts.map((item) => <button className={item.id === attempt?.id ? "active" : ""} key={item.id} type="button" onClick={() => { setSelectedAttempt(item.id); onSelectAttempt?.(item, selectedThread); }}><b>{item.label}</b><em>{item.status}</em></button>)}</div><button className="retry-button" type="button" onClick={() => onRetry(selectedThread.id)}><RotateCw size={13} />重试</button></section>}</div></aside>;
}

function AttemptDrawer({ thread, width, onResize, onClose, onRetry, onSelectAttempt, embedded = false }) {
  if (!thread) return null;
  return <aside className={`attempt-rail task-drawer ${embedded ? "embedded-drawer" : ""}`} style={embedded ? undefined : { width }} aria-label="Attempt 结果">{!embedded && <div className="rail-resizer rail-resizer-left" onPointerDown={(event) => { const start = event.clientX; const initial = width; const move = (e) => onResize(Math.max(240, Math.min(520, initial + start - e.clientX))); const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} />}<div className="attempt-rail-body"><p className="detail-kicker">{thread.title}</p>{(thread.attempts || []).map((attempt) => <button className="attempt-rail-item" type="button" key={attempt.id} onClick={() => onSelectAttempt?.(attempt)}><div><b>{attempt.label}</b><span>{attempt.status}</span><small>模型：{attempt.modelName || "暂无"}</small><small>质量：{attempt.quality || "暂无"}</small><small>创建时间：{formatAttemptCreatedAt(attempt.createdAt)}</small></div>{attempt.imageUrls?.[0] && <img src={attempt.imageUrls[0]} alt="结果缩略图" />}</button>)}</div></aside>;
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
  // 将可能很长的提示词压缩为卡片列表适用的一段摘要；空值时返回空字符串避免报错。
  const normalized = (prompt || "").replace(/\s+/g, " ").trim();
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
    setDraft({ prompt: item.prompt, model: normalizeModel(item.model), size: "auto", quality: "auto", mode: "图生图" }); navigate("/create"); setToast("已从此版本继续创作");
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
  function remix(work) { setDraft({ prompt: work.prompt, model: normalizeModel(work.model), size: work.size, mode: "图生图" }); navigate("/create"); setToast("已复制整套参数，可直接开始创作"); }
  return <section className="content-page community-page" ref={root}><PageHeading eyebrow="DISCOVER" title={<>灵感</>} description="看见喜欢的，带去继续创作。" action={<button className="primary-action" onClick={() => navigate("/create")}><WandSparkles size={16} />去创作</button>} />
    <section className="community-bento"><article className="bento-hero" onClick={() => setSelected(works[0])}><img src={works[0].image} alt="" /><div><span>本周精选</span><h2>{works[0].title}</h2><p>来自 {works[0].author} 的公开作品</p></div></article><article className="bento-prompt"><span>可以被复刻的画面</span><p>"{works[1].prompt.slice(0, 36)}..."</p><button onClick={() => remix(works[1])}>带走这套参数 <ArrowRight size={15} /></button></article><article className="bento-event"><span>正在进行</span><strong>#手机壁纸</strong><p>1,284 份灵感正在生长</p></article><article className="bento-creator"><img src={works[2].avatar} alt="" /><div><b>{works[2].author}</b><span>把夜色做成海报的人</span></div><button onClick={() => setFollowing((items) => items.includes(works[2].authorId) ? items.filter((id) => id !== works[2].authorId) : [...items, works[2].authorId])}>{following.includes(works[2].authorId) ? "已关注" : "关注"}</button></article></section>
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

function Modal({ title, children, onClose, headerExtra }) {
  // 以通用遮罩承载详情、编辑和解析界面；headerExtra 渲染在标题右侧，用于放置轻量操作。
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><header><div className="modal-title-group"><h2>{title}</h2>{headerExtra}</div><button onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

/**
 * 发布提示词模板弹窗：创作页与提示词库草稿共用的发布入口。
 * 从 props 接收提示词、标签与候选封面，发布成功后回调 onPublished 供调用方做善后处理。
 */
export function TemplatePublishModal({ onClose, prompt, tags = [], coverImages = [], referenceSlots = [], modelDefaults = {}, onPublished }) {
  const { setToast } = useStore();
  const [templateSaving, setTemplateSaving] = useState(false);
  const [selectedCover, setSelectedCover] = useState("");
  // AI 生成模板名称/简介的请求状态：请求中禁用按钮并显示加载文案。
  const [metadataGenerating, setMetadataGenerating] = useState(false);

  // 弹窗关闭时重置内部状态，避免下次打开时残留上次的选中封面。
  function handleClose() {
    setSelectedCover("");
    setMetadataGenerating(false);
    setTemplateSaving(false);
    onClose();
  }

  /** 调用大模型，根据提示词、标签和候选封面生成模板名称与简介并回填表单。 */
  async function generateTemplateMetadata(event) {
    event.preventDefault();
    if (metadataGenerating) return;
    // 按钮在 Modal headerExtra 内，不在 form 内部，无法通过 closest("form") 查找，改为直接查询弹窗内的表单元素。
    const titleInput = document.querySelector('.modal form [name="title"]');
    const descriptionInput = document.querySelector('.modal form [name="description"]');
    if (!titleInput || !descriptionInput) {
      console.warn("找不到模板名称或简介输入框");
      return;
    }
    if (!prompt.trim()) {
      setToast("请先填写提示词内容");
      return;
    }
    setMetadataGenerating(true);
    try {
      // 筛选有效的候选封面：草稿的本地 blob URL 无法传给后端，需要过滤掉。
      const validCoverUrl = (selectedCover || coverImages[0] || "").trim();
      const canSendCover = validCoverUrl && !validCoverUrl.startsWith("blob:");
      
      const response = await fetch("/ai/prompts/generate-metadata", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: prompt.trim(),
          // 标签只传有效项，帮助模型理解画面构成；空数组表示尚未生成标签。
          tags: (tags || [])
            .filter((tag) => String(tag?.key || "").trim() && String(tag?.value || "").trim())
            .map((tag) => ({ key: String(tag.key).trim(), value: String(tag.value).trim() })),
          // 草稿的本地 blob URL 后端无法访问，只传有效的远程图片 URL；空字符串表示无封面可用。
          resultImageUrl: canSendCover ? validCoverUrl : ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "模板信息生成失败，请稍后重试");
      if (!data.title || !data.description) throw new Error("未获得有效的模板名称与简介");
      // 仅当用户未手动填写时才回填，避免覆盖已输入的内容。
      if (!titleInput.value.trim()) titleInput.value = data.title;
      if (!descriptionInput.value.trim()) descriptionInput.value = data.description;
      setToast("模板名称与简介已生成，可继续编辑");
    } catch (error) {
      setToast(error.message || "模板信息生成失败，请稍后重试");
    } finally {
      setMetadataGenerating(false);
    }
  }

  /** 发布当前模板，封面优先使用手动选中的图片。 */
  async function publishCurrentTemplate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title || !prompt.trim()) {
      setToast("请填写模板名称和提示词内容");
      return;
    }
    setTemplateSaving(true);
    // 封面 URL 同样过滤掉本地 blob，避免草稿发布时把无效 URL 存入数据库。
    const finalCoverUrl = (selectedCover || coverImages[0] || "").trim();
    const payload = {
      title,
      description: String(form.get("description") || "").trim(),
      categoryCode: String(form.get("category") || "插画"),
      visibility: String(form.get("visibility") || "private"),
      userPromptTemplate: prompt.trim(),
      builderSnapshot: null,
      referenceSlots,
      tags,
      modelDefaults,
      coverUrl: finalCoverUrl.startsWith("blob:") ? "" : finalCoverUrl
    };
    try {
      const response = await fetch("/prompt_templates", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("模板发布失败");
      handleClose();
      onPublished?.(payload);
      setToast(payload.coverUrl ? "模板已发布，封面已设置" : "模板已发布");
    } catch (error) {
      setToast(error.message || "模板发布失败");
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <Modal
      title="发布提示词"
      onClose={handleClose}
      headerExtra={
        <button className="template-ai-generate" type="button" onClick={generateTemplateMetadata} disabled={metadataGenerating}>
          <Sparkles size={13} className={metadataGenerating ? "ai-spin" : ""} />
          {metadataGenerating ? "灵感凝合中…" : "AI 补全"}
        </button>
      }
    >
      <form className="template-form" onSubmit={publishCurrentTemplate}>
        <div className="template-form-section">
          <label>
            <span className="template-form-label-text">模板名称</span>
            <input name="title" autoFocus required placeholder="例如：明信片风格" />
          </label>
        </div>

        <div className="template-form-section">
          <label>
            <span className="template-form-label-text">模板简介</span>
            <textarea name="description" placeholder="说明模板适合的场景和用途" />
          </label>
        </div>

        <div className="template-form-section">
          <label>
            <span className="template-form-label-text">模板分类</span>
            <select name="category" defaultValue="插画">
              <option>插画</option>
              <option>头像</option>
              <option>海报</option>
              <option>壁纸</option>
              <option>明信片</option>
              <option>小红书插图</option>
            </select>
          </label>
        </div>

        <div className="template-form-section">
          <label>
            <span className="template-form-label-text">发布权限</span>
            <select name="visibility" defaultValue="private">
              <option value="public">社区（所有人可见）</option>
              <option value="followers">关注我的人可见</option>
              <option value="private">私有（仅自己可见）</option>
            </select>
          </label>
        </div>

        <div className="template-form-section">
          <span className="template-form-label-text">封面图片</span>
          <div className="template-cover-picker">
            <div className="cover-options">
              {coverImages.map((image, index) => (
                <div
                  key={index}
                  className={`cover-option ${selectedCover === image ? "selected" : ""}`}
                  onClick={() => setSelectedCover(image)}
                >
                  <img src={image} alt={`候选封面 ${index + 1}`} />
                </div>
              ))}
              <label className="cover-option upload">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setSelectedCover(String(reader.result));
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <UploadCloud size={22} />
                <span>自定义上传</span>
              </label>
            </div>
            {!selectedCover && coverImages.length === 0 && (
              <small style={{ color: "#9EA08C", fontSize: "12px", fontStyle: "italic" }}>
                暂无生成图，请上传封面或稍后同步
              </small>
            )}
          </div>
        </div>

        <button className="primary-action" type="submit" disabled={templateSaving}>
          <ArrowUpRight size={16} />
          {templateSaving ? "发布中…" : "发布模板"}
        </button>
      </form>
    </Modal>
  );
}

export default LegacyApp;





