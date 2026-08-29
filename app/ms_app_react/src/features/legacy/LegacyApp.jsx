import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowDownToLine, ArrowRight, Bookmark, Check, ChevronDown, Clock3, Copy, Download,
  FileImage, FolderOpen, Heart, ImagePlus, Layers3, LayoutGrid, Maximize2, MessageCircle, MoreHorizontal,
  Palette, Plus, Search, Send, Settings2, Sparkles, Star, Trash2, UploadCloud, UserRound,
  WandSparkles, X, Zap
} from "lucide-react";
import { image } from "../../assets/mockData";
import { useStore } from "../../store/AppStore";

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
  return name.replace(/\.[^.]+$/, "");
}

function editorPromptText(element) {
  return Array.from(element.childNodes).map((node) => node.nodeType === Node.ELEMENT_NODE && node.dataset.promptValue ? node.dataset.promptValue : node.textContent || "").join("").replace(/\u200b/g, "");
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
  const mode = "创作";
  const [prompt, setPrompt] = useState(draft.prompt || "让雨后的花园在清晨醒来，湿润的石阶、透明椅子与一点柔软的蓝绿色光。画面像一张安静的编辑照片。");
  const [files, setFiles] = useState([]);
  const [count, setCount] = useState(1);
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [promptFullscreen, setPromptFullscreen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const richPromptRef = useRef(null);
  const promptRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const editor = richPromptRef.current;
    if (editor && document.activeElement !== editor && editorPromptText(editor) !== prompt) editor.innerText = prompt;
  }, [prompt]);

  useGSAP(() => { gsap.fromTo(".create-intro > *", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.09, duration: 0.75, ease: "power3.out" }); }, { scope: canvasRef });

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

  function startGeneration() {
    // 按排队、生成、完成三个阶段模拟异步图片生成。
    if (!prompt.trim() || status !== "idle") return;
    const spend = count * (mode === "批量出图" ? 24 : 12);
    if (credits < spend) { setToast("算力不足，请前往个人中心查看权益"); return; }
    setDraft({ ...draft, prompt, mode }); setCredits(credits - spend); setStatus("queued"); setResults([]);
    setTimeout(() => setStatus("working"), 850);
    setTimeout(() => {
      const next = Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), image: image(`generated-${Date.now()}-${index}`), title: `${mode} · ${index + 1}`, version: "初稿" }));
      setResults(next); setStatus("done");
      next.forEach((result) => addLibraryWork({ id: result.id, title: result.title, image: result.image, status: "已完成", createdAt: "刚刚", prompt, model: draft.model || "gpt-image-2", versions: ["初稿"] }));
      setToast("作品已加入素材库");
    }, 2800);
  }

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
    const chip = document.createElement("span");
    chip.className = "mention-chip";
    chip.contentEditable = "false";
    chip.dataset.fileId = file.id;
    chip.textContent = referenceLabel(file.file.name);
    chip.dataset.promptValue = `[${files.findIndex((item) => item.id === file.id) + 1}:${referenceLabel(file.file.name)}]`;
    range.insertNode(chip);
    range.setStartAfter(chip); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    setMentionOpen(false);
    syncRichPrompt();
  }


  return <section className="create-page" ref={canvasRef}>
    <div className="create-intro"><div><h1>开始创作</h1><p>把灵感交给画面。</p></div></div>
    <div className="creation-note"><span>提示词创作</span><small>参考图、文字和参数会一起决定画面</small></div>
    <div className="studio-grid">
      <section className="creation-controls">
        <div className="control-title"><span>参考图</span><small>可选 · 最多 4 张</small></div>
        <div className={`reference-strip ${files.length ? "has-files" : "empty"}`} onDragOver={(event) => event.preventDefault()} onDrop={dropReferences}>{files.map((item) => <div className="reference-item" key={item.id}><img src={item.url} alt={item.file.name} /><div className="reference-caption"><span>{item.file.name}</span><button onClick={() => removeReference(item.id)} title="移除参考图"><X size={13} /></button></div></div>)}{files.length < 4 && <label className="reference-add"><ImagePlus size={24} /><div><b>{files.length ? "继续添加" : "添加参考图"}</b><small>{files.length ? `${files.length}/4 张` : "点击或拖拽图片到这里"}</small></div><input type="file" accept="image/*" multiple onChange={(event) => addReferences(event.target.files)} /></label>}</div>
        <div className="prompt-editor"><div className="prompt-editor-head"><span>你的构想</span><div><small className="prompt-hint">输入 @ 关联参考图</small><button type="button" onClick={() => setPromptFullscreen(true)} title="全屏查看提示词"><Maximize2 size={15} /></button></div></div><div ref={richPromptRef} className="rich-prompt" contentEditable suppressContentEditableWarning onInput={syncRichPrompt} onKeyDown={(event) => { if (!mentionOpen || !mentionCandidates.length) { if (event.key === "Escape") setMentionOpen(false); return; } if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + mentionCandidates.length) % mentionCandidates.length); } else if (event.key === "Enter") { event.preventDefault(); insertMention(mentionCandidates[mentionIndex]); } else if (event.key === "Escape") setMentionOpen(false); }} data-placeholder="写下你的创作构想…" />{mentionOpen && mentionCandidates.length > 0 && <div className="mention-menu"><div className="mention-title">关联参考图 · ↑↓ 选择，Enter 确认</div>{mentionCandidates.map((item, index) => <button type="button" className={index === mentionIndex ? "active" : ""} key={item.id} onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => { event.preventDefault(); insertMention(item); }}><img src={item.url} alt="" /><span>[{files.findIndex((file) => file.id === item.id) + 1}:{referenceLabel(item.file.name)}]</span><kbd>{index + 1}</kbd></button>)}</div>}<small className="prompt-count">{prompt.length}/5000</small></div>
        <div className="control-fields"><SelectField label="模型" value={draft.model || "gpt-image-2"} options={["gpt-image-2", "dall-e-3"]} onChange={(value) => setDraft({ ...draft, model: value })} /><SelectField label="比例" value={draft.size || "1024×1024"} options={["1024×1024", "1024×1536", "1536×1024"]} onChange={(value) => setDraft({ ...draft, size: value })} /><SelectField label="质量" value="高" options={["标准", "高"]} onChange={() => {}} /><SelectField label="数量" value={String(count)} options={["1", "2", "3", "4"]} onChange={(value) => setCount(Number(value))} /></div>
        <div className="control-footer"><button className="plain-button"><Settings2 size={15} />高级参数</button><button className="create-button" onClick={startGeneration} disabled={status !== "idle" || !prompt.trim()}><WandSparkles size={17} />{status === "idle" ? "开始生成" : status === "queued" ? "正在排队" : status === "working" ? "正在生成" : "已生成"}</button></div>
      </section>
      <section className="creation-canvas">
        <div className="canvas-label"><span>{mode}</span><span>{status === "done" ? "交付完成" : "图像实验室"}</span></div>
        {status === "idle" && <div className="canvas-empty"><div className="empty-star"><Sparkles size={23} /></div><h2>在这里等待<br />一个新的视野。</h2><p>填写构想，或者添加一张参考图开始。</p></div>}
        {(status === "queued" || status === "working") && <div className="canvas-empty"><div className="orbit-loader"><span /></div><h2>{status === "queued" ? "灵感正在排队" : "画面正在显影"}</h2><p>{status === "queued" ? "任务将很快开始。" : "模型正在理解光线、构图与细节。"}</p></div>}
        {status === "done" && <div className={`result-gallery count-${results.length}`}>{results.map((result) => <article className="result-image" key={result.id}><img src={result.image} alt={result.title} /><div><span>{result.title}</span><button onClick={() => setToast("已收藏到个人画廊")}><Bookmark size={15} /></button><button onClick={() => setToast("已准备下载高清图")}><Download size={15} /></button></div></article>)}</div>}
        <div className="canvas-status"><span>消耗 {count * (mode === "批量出图" ? 24 : 12)} 算力</span><span>{files.length ? `${files.length} 张参考图已就绪` : "无需参考图也可创作"}</span></div>
      </section>
    </div>
    {promptFullscreen && <PromptFullscreen value={prompt} onChange={setPrompt} onClose={() => setPromptFullscreen(false)} />}
  </section>;
}

function PromptFullscreen({ value, onChange, onClose }) {
  // 提供全屏提示词编辑器，便于长文本阅读和修改。
  return <div className="prompt-fullscreen" role="dialog" aria-modal="true"><div className="prompt-fullscreen-panel"><header><div><span>提示词编辑</span><small>{value.length}/5000</small></div><button type="button" onClick={onClose} title="关闭全屏"><X size={19} /></button></header><textarea autoFocus value={value} maxLength="5000" onChange={(event) => onChange(event.target.value)} placeholder="写下你的创作构想…" /><footer><span>支持长提示词，可随时调整画面细节。</span><button type="button" className="primary-action" onClick={onClose}>完成</button></footer></div></div>;
}

function SelectField({ label, value, options, onChange }) {
  // 渲染创作参数下拉选择控件。
  return <label className="select-field"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div></label>;
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
    setDraft({ prompt: item.prompt, model: "gpt-image-2", size: "1024×1024", mode: "文本生图" }); navigate("/create"); setToast("提示词已带入创作工作台");
  }
  return <section className="content-page prompt-page"><PageHeading title={<>提示词库</>} description="收藏、整理、复用。" action={<button className="primary-action" onClick={() => setNewOpen(true)}><Plus size={16} />新建模板</button>} />
    <div className="prompt-utility"><div className="search-box"><Search size={17} /><input placeholder="搜索标题、风格、标签" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filter-row">{["全部", "官方", "社区", "我的"].map((item) => <button className={source === item ? "active" : ""} onClick={() => setSource(item)} key={item}>{item}</button>)}</div></div>
    <div className="category-row">{categories.map((item) => <button key={item} className={category === item ? "chosen" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="prompt-layout"><div className="prompt-grid">{list.map((item) => <article className="prompt-card" key={item.id}><img src={item.cover} alt="" /><div className="prompt-card-body"><div className="card-overline"><span>{item.source} · {item.category}</span><button onClick={() => togglePrompt(item.id)} className={item.saved ? "saved" : ""} title={item.saved ? "取消收藏" : "收藏模板"}><Bookmark size={16} fill={item.saved ? "currentColor" : "none"} /></button></div><h3>{item.title}</h3><p className="prompt-preview">{getPromptExcerpt(item.prompt)}</p><div className="prompt-card-meta"><span>{item.prompt.length} 字</span><div className="tag-list">{item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="card-actions"><button onClick={() => setSelectedPrompt(item)}>查看全文</button><button onClick={() => usePrompt(item)}><Copy size={14} />套用</button>{item.source === "我的" && <button onClick={() => updatePrompt(item.id, { source: "社区" })}>发布</button>}{item.source === "社区" && <button onClick={() => updatePrompt(item.id, { source: "我的" })}>撤回</button>}{item.source === "我的" && <button onClick={() => deletePrompt(item.id)} title="删除模板"><Trash2 size={14} /></button>}</div></div></article>)}</div>
      <aside className="reverse-prompt"><Palette size={22} /><h2>从图像里，读出它的语言。</h2><p>上传一张作品，模拟 AI 会拆开主体、镜头、光线、风格与参数。</p><button onClick={() => setReverseOpen(true)}>解析一张图片 <ArrowRight size={15} /></button></aside></div>
    {selectedPrompt && <PromptDetailModal item={selectedPrompt} onClose={() => setSelectedPrompt(null)} onUse={() => usePrompt(selectedPrompt)} />}
    {reverseOpen && <ReverseModal onClose={() => setReverseOpen(false)} onUse={(text) => { setDraft({ prompt: text, model: "gpt-image-2", size: "1024×1024", mode: "图生图" }); navigate("/create"); }} onSave={(text) => { addPrompt({ title: "从作品拆解", category: "插画", tags: ["反向解析", "编辑感"], prompt: text, cover: image("reverse-template") }); setReverseOpen(false); setToast("已保存为我的模板"); }} />}
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
    setDraft({ prompt: item.prompt, model: item.model, size: "1024×1024", mode: "图生图" }); navigate("/create"); setToast("已从此版本继续创作");
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
