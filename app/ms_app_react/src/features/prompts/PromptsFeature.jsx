import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, Check, Copy, Grid2X2, ImagePlus, List, Palette, Plus, Search, X, Pencil, Trash2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ImagePreview, TemplatePublishModal, Modal } from "../legacy/LegacyApp";
import { useStore } from "../../store/AppStore";
import { clearCachedState } from "../../store/AppStore";
import { saveDraft, getDraftsByType, deleteDraft, formatRelativeTime, cleanupOldDrafts } from "../../utils/draftStorage";

const categories = ["全部", "头像", "壁纸", "海报", "插画", "明信片", "小红书插图"];
const sources = ["全部", "社区", "我的"];

function excerpt(value, max = 100) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 将模板标签的 JSON 对象转为可展示、可检索的文字，避免出现 [object Object]。 */
function formatTag(tag) {
  if (tag == null) return "";
  if (typeof tag === "string" || typeof tag === "number") return String(tag);
  if (typeof tag === "object") {
    const key = String(tag.key || tag.name || tag.label || "").trim();
    const value = String(tag.value || "").trim();
    if (key && value) return `${key}: ${value}`;
    return key || value;
  }
  return "";
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(formatTag).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeTags(parsed);
    } catch {
      return value.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

/** 用户输入只保留正文，结构化字段单独作为标签展示。 */
function splitTemplatePrompt(item) {
  const prompt = String(item.userPromptTemplate || item.prompt || "");
  const rawTags = normalizeTags(item.tags);
  const fieldLines = new Set(rawTags.map((tag) => tag.split(":")[0].trim()));
  const lines = prompt.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const userLines = lines.filter((line) => !fieldLines.has(line.split(":")[0].trim()));
  return { prompt: userLines.join("\n"), tags: rawTags };
}

/** 将后端模板响应映射为提示词库现有卡片数据。 */
function normalizeTemplate(item) {
  const parsed = splitTemplatePrompt(item);
  return { ...item, prompt: parsed.prompt, category: item.category || item.categoryCode || "插画", source: item.source || "我的", cover: item.coverUrl || item.cover || "", tags: parsed.tags, saved: Boolean(item.saved), editable: Boolean(item.editable) };
}

/** 提示词库只使用服务端数据，避免页面加载时闪现本地示例。 */
export default function PromptsFeature() {
  const { setToast } = useStore();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState([]);
  const [source, setSource] = useState("全部");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  // 图像解析服务暂未放开：入口点击后展示"开发中"弹窗，而不是打开解析抽屉。
  const [analysisDisabledOpen, setAnalysisDisabledOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  // 当前放大查看的封面图：{ src, title }，由抽屉封面点击触发。
  const [previewImage, setPreviewImage] = useState(null);
  
  // 图像解析相关状态
  const [parseImage, setParseImage] = useState(null); // 待解析的图片文件
  const [parseImagePreview, setParseImagePreview] = useState(""); // 图片预览URL
  const [parseIntent, setParseIntent] = useState(""); // 用户的解析意图
  const [parsing, setParsing] = useState(false); // 解析中
  const [parseResult, setParseResult] = useState(null); // 解析结果 { analysisSummary, tags: [{tagName, tagValue}] }
  const [isDragging, setIsDragging] = useState(false); // 拖拽状态
  
  // 草稿列表
  const [drafts, setDrafts] = useState([]);
  // 正在发布为模板的草稿：非空时渲染发布弹窗。
  const [publishDraft, setPublishDraft] = useState(null);

  useEffect(() => {
    // 加载草稿列表并清理过期草稿
    cleanupOldDrafts();
    setDrafts(getDraftsByType("parse"));
  }, []);
  
  // 刷新草稿列表
  function refreshDrafts() {
    setDrafts(getDraftsByType("parse"));
  }

  useEffect(() => {
    let active = true;
    // no-store：绕过浏览器 HTTP 缓存（含历史上被缓存下来的 301 重定向），
    // 否则旧缓存的 http:// 重定向会在本地拦截请求，导致提示词列表加载不出来。
    fetch("/prompt_templates?page=0&size=50", { credentials: "include", cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("提示词库加载失败"); return response.json(); })
      .then((items) => { if (active && Array.isArray(items)) { setPrompts(items.map(normalizeTemplate)); setLoadError(""); } })
      .catch(() => { if (active) { setPrompts([]); setLoadError("提示词库暂时无法连接，请稍后重试"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setToast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts.filter((item) => {
      const text = `${item.title} ${item.description || ""} ${item.prompt} ${(item.tags || []).join(" ")}`.toLowerCase();
      return (source === "全部" || item.source === source) && (category === "全部" || item.category === category) && (!q || text.includes(q));
    }).sort((a, b) => sort === "saved" ? Number(b.saved) - Number(a.saved) : sort === "title" ? a.title.localeCompare(b.title, "zh") : String(b.updatedAt || b.id).localeCompare(String(a.updatedAt || a.id)));
  }, [prompts, source, category, query, sort]);

  function closeOverlay() { setSelected(null); setEditor(null); setAnalysisOpen(false); }
  function openEditor(item = null) {
    setSelected(null);
    if (!item) {
      // 新建模板：直接进入构建器。构建器维护独立状态，不预写全局 draft，避免污染创作模块。
      navigate("/create/prompt-builder");
      return;
    }
    setEditor({ ...item, coverPreview: item.cover || "" });
  }

  /** 携带模板内容跳转提示词构建器；构建器保存时回写同 id 的模板。 */
  function editPromptInBuilder(item) {
    closeOverlay();
    navigate("/create/prompt-builder", { state: { templateId: item.id } });
  }

  /** 上传新封面并更新列表；仅编辑已有模板时可用。 */
  async function uploadCover(file) {
    if (!editor?.id || !file) return;
    setCoverUploading(true);
    try {
      const form = new FormData();
      form.append("cover", file);
      const response = await fetch(`/prompt_templates/${editor.id}/cover`, { method: "POST", credentials: "include", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "封面上传失败");
      const updated = normalizeTemplate(data);
      setPrompts((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditor((current) => ({ ...current, cover: updated.cover, coverPreview: updated.cover }));
      setToast("封面已更新");
    } catch (error) {
      setToast(error.message || "封面上传失败");
    } finally {
      setCoverUploading(false);
    }
  }

  /** 移除封面：cover_url 置空，模板本身保留。 */
  async function removeCover() {
    if (!editor?.id) { setEditor((current) => ({ ...current, cover: "", coverPreview: "" })); return; }
    setCoverUploading(true);
    try {
      const form = new FormData();
      // 空文件用于复用上传通道不可行，这里直接走部分更新接口传空串清除封面。
      const response = await fetch(`/prompt_templates/${editor.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coverUrl: "" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "封面移除失败");
      const updated = normalizeTemplate(data);
      setPrompts((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditor((current) => ({ ...current, cover: "", coverPreview: "" }));
      setToast("封面已移除");
    } catch (error) {
      setToast(error.message || "封面移除失败");
    } finally {
      setCoverUploading(false);
    }
  }

  async function usePrompt(item) {
    await fetch(`/prompt_templates/${item.id}/use`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userPrompt: item.prompt }) }).catch(() => {});
    clearCachedState([
      "create:files",
      "create:referencesLocked",
      "create:status",
      "create:threadId",
      "create:attemptId",
      "create:results",
      "create:taskName",
      "create:tagsCollapsed"
    ]);
    setDraft({
      prompt: item.prompt,
      tags: normalizeTags(item.tags).map((tag) => {
        const [key, ...rest] = tag.split(":");
        return { key: key.trim(), value: rest.join(":").trim() };
      }),
      references: [],
      model: "gpt-image-2",
      size: "auto",
      quality: "auto",
      mode: "文本生图"
    });
    navigate("/create");
    setToast("提示词已带入创作工作台");
  }

  async function copyPrompt(item) { await navigator.clipboard?.writeText(item.prompt).catch(() => {}); setToast("提示词已复制到剪贴板"); }

  async function toggleFavorite(item) {
    try {
      const response = await fetch(`/prompt_templates/${item.id}/favorite?saved=${!item.saved}`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("收藏操作失败");
      const updated = normalizeTemplate(await response.json());
      setPrompts((items) => items.map((current) => current.id === item.id ? updated : current));
    } catch (error) { setToast(error.message || "收藏操作失败"); }
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // 只提交表单实际收集的字段；提示词与标签在构建器中维护，编辑时通过部分更新保持原值。
    const payload = {
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim(),
      categoryCode: String(form.get("category") || "插画"),
      visibility: form.get("visibility") === "public" ? "public" : "private"
    };
    if (!payload.title) { setToast("请填写模板名称"); return; }
    setSaving(true);
    try {
      const editing = editor?.id;
      if (editing) {
        const response = await fetch(`/prompt_templates/${editing}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("模板保存失败");
        const saved = normalizeTemplate(await response.json());
        setPrompts((items) => items.map((item) => item.id === editing ? saved : item));
        closeOverlay();
        setToast("模板已更新");
        return;
      }
      // 新建场景：提示词必填，来自当前草稿内容。
      payload.userPromptTemplate = String(editor?.prompt || "").trim();
      payload.tags = editor?.tags || [];
      if (!payload.userPromptTemplate) { setToast("请先在构建器中填写提示词内容"); return; }
      const response = await fetch("/prompt_templates", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("模板保存失败");
      const saved = normalizeTemplate(await response.json());
      setPrompts((items) => [saved, ...items]);
      closeOverlay();
      setToast("模板已保存到我的提示词");
    } catch (error) { setToast(error.message || "模板保存失败"); } finally { setSaving(false); }
  }

  async function deleteTemplate(item) {
    if (!window.confirm(`确定删除"${item.title}"吗？`)) return;
    try {
      const response = await fetch(`/prompt_templates/${item.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("模板删除失败");
      setPrompts((items) => items.filter((current) => current.id !== item.id)); closeOverlay(); setToast("模板已删除");
    } catch (error) { setToast(error.message || "模板删除失败"); }
  }

  // 图像解析相关函数
  function handleParseImageSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // 检查文件类型
    if (!file.type.startsWith("image/")) {
      setToast("请选择图片文件");
      return;
    }
    
    // 设置图片和预览
    setParseImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setParseImagePreview(e.target.result);
    reader.readAsDataURL(file);
    
    // 清空之前的结果
    setParseResult(null);
  }

  function handleParseDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      setToast("请拖入图片文件");
      return;
    }
    
    setParseImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setParseImagePreview(e.target.result);
    reader.readAsDataURL(file);
    setParseResult(null);
  }

  function handleParseDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleParseDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function clearParseImage() {
    setParseImage(null);
    setParseImagePreview("");
    setParseResult(null);
    setParseIntent("");
  }

  async function executeImageParse() {
    console.log('========== 图像解析函数被调用 ==========');
    console.log('parseImage:', parseImage);
    console.log('parseIntent:', parseIntent);
    
    if (!parseImage) {
      console.log('[PromptsFeature] 错误：没有图片');
      setToast("请先上传图片");
      return;
    }

    console.log('[PromptsFeature] 开始图像解析，图片:', parseImage.name, '意图:', parseIntent);
    setParsing(true);
    try {
      // 后端 /ai/prompts/parse-image 接收 multipart 表单（userPrompt + image 文件），
      // 图片由后端统一上传 OSS，前端无需单独上传。
      const form = new FormData();
      const userPrompt = parseIntent.trim() || "全面解析这张图片，提取可用于生成类似图片的提示词";
      form.append("userPrompt", userPrompt);
      form.append("image", parseImage);
      
      console.log('[PromptsFeature] 发送请求到 /ai/prompts/parse-image，userPrompt:', userPrompt);

      const response = await fetch("/ai/prompts/parse-image", {
        method: "POST",
        credentials: "include",
        body: form
      });

      console.log('[PromptsFeature] 响应状态:', response.status, response.statusText);

      const data = await response.json().catch((err) => {
        console.error('[PromptsFeature] JSON 解析失败:', err);
        return {};
      });
      
      console.log('[PromptsFeature] 响应数据:', data);
      
      if (!response.ok) throw new Error(data.message || "图像解析失败");

      // 后端返回 { analysisSummary, tags: [{tagName, tagValue}], imageUrl }
      if (!data.tags?.length) throw new Error("未解析出有效的标签提示词");
      setParseResult(data);
      setToast("解析完成");
      console.log('[PromptsFeature] 解析成功，结果:', data);
    } catch (error) {
      console.error('[PromptsFeature] 图像解析失败:', error);
      setToast(error.message || "图像解析失败，请稍后重试");
    } finally {
      setParsing(false);
    }
  }

  function saveParseToDraftStorage() {
    if (!parseResult) return;

    // 将解析结果保存到草稿；后端标签为 { tagName, tagValue } 驼峰格式。
    const tags = (parseResult.tags || []).map((tag) => ({
      key: tag.tagName || "",
      value: tag.tagValue || ""
    })).filter((tag) => tag.key);

    // 构建"用户输入"芯片的内容：只放总结文本
    const userPrompt = parseResult.analysisSummary || "";

    const draftData = {
      prompt: userPrompt,
      tags: tags,
      references: parseResult.imageUrl ? [
        { 
          id: `parse-ref-${Date.now()}`,
          url: parseResult.imageUrl,  // 使用后端返回的 OSS URL，而不是本地 blob
          type: "image",
          name: parseImage?.name || "解析的图片",
          file: null  // OSS 图片无需保留本地 File 对象
        }
      ] : [],
      source: "图像解析",
      model: "gpt-image-2",
      size: "auto",
      quality: "auto",
      mode: "文本生图",
      type: "parse"  // 明确标记为图像解析类型草稿，与列表查询保持一致
    };

    // 保存到 localStorage 并获取草稿 ID
    console.log('[PromptsFeature] 准备保存草稿，数据:', draftData);
    const draftId = saveDraft(draftData);
    console.log('[PromptsFeature] 草稿已保存，ID:', draftId);
    
    if (draftId) {
      // 关闭解析对话框并跳转到提示词构建页，传递草稿 ID
      setAnalysisOpen(false);
      clearParseImage();
      refreshDrafts(); // 刷新草稿列表
      navigate(`/create/prompt-builder?draft=${draftId}`);
      setToast("解析结果已保存为草稿");
    } else {
      setToast("草稿保存失败，请重试");
    }
  }

  // 将草稿发布为模板：打开与创作页共用的"发布提示词"弹窗，草稿内容预填。
  function publishDraftAsTemplate(draft) {
    setPublishDraft(draft);
  }


  return <section className="prompt-library-v2">
    <section className="prompt-controls-v2"><div className="prompt-search-v2"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、描述或标签" /></div><div className="prompt-control-actions"><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="排序"><option value="recent">最近更新</option><option value="saved">收藏优先</option><option value="title">按名称</option></select><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="网格视图"><Grid2X2 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={17} /></button><button className="new-prompt-v2" onClick={() => openEditor()}><Plus size={16} />新建模板</button></div><div className="prompt-filter-line"><div className="prompt-tabs-v2">{sources.map((item) => <button key={item} className={source === item ? "active" : ""} onClick={() => setSource(item)}>{item}<small>{item === "全部" ? prompts.length : prompts.filter((p) => p.source === item).length}</small></button>)}</div><div className="prompt-categories-v2">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div></section>
    <div className="prompt-content-v2"><main>{loading && <div className="prompt-empty-v2"><strong>正在加载提示词库…</strong></div>}{!loading && loadError && <div className="prompt-empty-v2"><Search size={22} /><strong>{loadError}</strong><span>请确认后端服务已启动。</span></div>}<div className={`prompt-grid-v2 ${view === "list" ? "is-list" : ""}`}>{visible.map((item) => <article className="prompt-card-v2" key={item.id} onClick={() => setSelected(item)}><div className="prompt-cover-v2">{item.cover && <img src={item.cover} alt="" />}<div><span>{item.source} · {item.category}</span><button onClick={(event) => { event.stopPropagation(); toggleFavorite(item); }} className={item.saved ? "saved" : ""} aria-label="收藏"><Bookmark size={16} fill={item.saved ? "currentColor" : "none"} /></button></div></div><div className="prompt-card-body-v2"><div className="prompt-title-v2"><h3>{item.title}</h3><small>{item.prompt.length} 字</small></div><p>{excerpt(item.description || item.prompt)}</p><div className="prompt-tags-v2">{(item.tags || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="prompt-actions-v2"><button onClick={(event) => { event.stopPropagation(); copyPrompt(item); }}><Copy size={14} />复制</button><button onClick={(event) => { event.stopPropagation(); usePrompt(item); }}>套用构建器 <ArrowRight size={14} /></button></div></div></article>)}</div>{!loading && !loadError && !visible.length && <div className="prompt-empty-v2"><Search size={22} /><strong>提示词库还是空的</strong><span>创建第一个模板后，它会显示在这里。</span></div>}</main><aside className="prompt-rail-v2"><div className="prompt-insight-v2 is-clickable" role="button" tabIndex={0} onClick={() => setAnalysisDisabledOpen(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setAnalysisDisabledOpen(true); } }}><Palette size={20} /><span>BUILDING WITH CONTEXT</span><h2>从一张图开始，<em>反向读出它的语言。</em></h2><p>上传参考图，拆解主体、镜头、光线与材质，再保存为可调用的模板。</p><button type="button" onClick={(event) => { event.stopPropagation(); setAnalysisDisabledOpen(true); }}>打开图像解析 <ArrowRight size={15} /></button></div>
    
    {/* 草稿列表区域 */}
    <div className="prompt-drafts-v2">
      <div className="prompt-drafts-header">
        <b>图像解析</b>
        <span>{drafts.length} 个草稿</span>
      </div>
      {drafts.length > 0 ? (
        drafts.map((draft) => (
          <div key={draft.id} className="prompt-draft-item">
            <button 
              className="draft-main-content"
              onClick={() => {
                navigate(`/create/prompt-builder?draft=${draft.id}`);
              }}
            >
              {draft.references?.[0]?.url && (
                <img src={draft.references[0].url} alt="" />
              )}
              <span>
                <strong>{draft.prompt.slice(0, 20)}...</strong>
                <small>{formatRelativeTime(draft.createdAt)}</small>
              </span>
            </button>
            <div className="draft-actions">
              <button
                className="draft-publish-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  publishDraftAsTemplate(draft);
                }}
                title="发布为模板"
              >
                <Upload size={14} />
              </button>
              <button
                className="draft-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteDraft(draft.id);
                  refreshDrafts();
                  setToast("草稿已删除");
                }}
                title="删除草稿"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="prompt-drafts-empty">
          <small>解析图片后，草稿会保存在这里</small>
        </div>
      )}
    </div>
    
    <div className="prompt-recent-v2"><div><b>最近使用</b><span>查看全部 →</span></div>{prompts.slice(0, 3).map((item) => <button key={item.id} onClick={() => setSelected(item)}><img src={item.cover} alt="" /><span><strong>{item.title}</strong><small>刚刚使用</small></span><ArrowRight size={14} /></button>)}</div></aside></div>
    {(selected || editor || analysisOpen) && <div className="prompt-overlay-v2" onMouseDown={closeOverlay}><aside className="prompt-drawer-v2" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close-v2" onClick={closeOverlay}><X size={18} /></button>{selected && <>{selected.cover && <img className="drawer-cover-v2 is-clickable" src={selected.cover} alt={selected.title} title="点击放大查看" onClick={() => setPreviewImage({ src: selected.cover, title: selected.title })} />}<span className="drawer-kicker-v2">{selected.source} · {selected.category}</span><h2>{selected.title}</h2><p className="drawer-prompt-v2">{selected.prompt}</p><div className="prompt-tags-v2">{(selected.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="drawer-buttons-v2"><button onClick={() => usePrompt(selected)}>套用到创作 <ArrowRight size={15} /></button>{selected.editable && <><button onClick={() => openEditor(selected)}><Pencil size={15} />编辑</button><button onClick={() => deleteTemplate(selected)}><Trash2 size={15} />删除</button></>}</div></>}{editor && <form className="new-template-v2" onSubmit={saveTemplate}>
  {/* 表单头：英文 kicker + 衬线标题，与抽屉详情区保持同一版式。 */}
  <header className="drawer-form-head">
    <span className="drawer-kicker-v2">{editor.id ? "EDIT TEMPLATE" : "NEW TEMPLATE"}</span>
    <h2>{editor.id ? "编辑提示词模板" : "新建提示词模板"}</h2>
  </header>
  <label>
    <span className="template-form-label-text">模板名称</span>
    <input name="title" defaultValue={editor.title} placeholder="例如：柔和的室内肖像" autoFocus />
  </label>
  <label>
    <span className="template-form-label-text">模板描述</span>
    <input name="description" defaultValue={editor.description || ""} placeholder="一句话说明模板适合什么场景" />
  </label>
  {/* 分类与权限并排放置，缩短表单总高度。 */}
  <div className="drawer-form-row">
    <label>
      <span className="template-form-label-text">所属分类</span>
      <select name="category" defaultValue={editor.category}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select>
    </label>
    <label>
      <span className="template-form-label-text">发布权限</span>
      <select name="visibility" defaultValue={editor.visibility || "private"}>
        <option value="public">社区（所有人可见）</option>
        <option value="followers">关注我的人可见</option>
        <option value="private">私有（仅自己可见）</option>
      </select>
    </label>
  </div>
  {/* 封面管理：预览当前封面，支持上传替换或移除。 */}
  <div className="template-form-section">
    <span className="template-form-label-text">封面图片</span>
    <div className="drawer-cover-manager">
      <div className={`drawer-cover-preview ${editor.coverPreview ? "" : "is-empty"}`}>
        {editor.coverPreview
          ? <img src={editor.coverPreview} alt="当前封面" />
          : <span>暂无封面</span>}
      </div>
      <div className="drawer-cover-actions">
        <label className={`drawer-cover-upload ${coverUploading ? "is-busy" : ""}`}>
          <input type="file" accept="image/*" hidden disabled={coverUploading || !editor.id}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCover(file); event.target.value = ""; }} />
          {coverUploading ? "上传中…" : editor.coverPreview ? "更换封面" : "上传封面"}
        </label>
        {editor.coverPreview && <button type="button" className="drawer-cover-remove" onClick={removeCover} disabled={coverUploading}>移除封面</button>}
        {!editor.id && <small className="drawer-cover-note">保存模板后可设置封面</small>}
      </div>
    </div>
  </div>
  {/* 提示词在构建器中维护：底部提供跳转入口，与保存按钮纵向排列。 */}
  <div className="drawer-form-actions">
    {editor.id && <button type="button" className="drawer-edit-prompt" onClick={() => editPromptInBuilder(editor)}>
      <Pencil size={15} />编辑提示词
    </button>}
    <button className="drawer-submit-v2" type="submit" disabled={saving}><Check size={16} />{saving ? "保存中…" : "保存模板"}</button>
  </div>
</form>}{analysisOpen && <div className="analysis-panel-v2">
  <header className="analysis-header">
    <Palette size={25} />
    <h2>解析一张图片</h2>
    <p>上传作品后，AI 会提取主体、构图、光线与材质，生成可复用的提示词。</p>
  </header>
  
  {/* 图片上传区 */}
  <div 
    className={`analysis-upload-zone ${isDragging ? "is-dragging" : ""} ${parseImagePreview ? "has-image" : ""}`}
    onDrop={handleParseDrop}
    onDragOver={handleParseDragOver}
    onDragLeave={handleParseDragLeave}
  >
    {parseImagePreview ? (
      <div className="analysis-image-preview">
        <img src={parseImagePreview} alt="待解析图片" />
        <button 
          type="button" 
          className="analysis-clear-image" 
          onClick={clearParseImage}
          disabled={parsing}
        >
          <X size={16} />
        </button>
      </div>
    ) : (
      <label className="analysis-upload-label">
        <div className="analysis-upload-icon"><ImagePlus size={40} strokeWidth={1.5} /></div>
        <span>点击选择或拖入图片</span>
        <small>支持 JPG、PNG、WebP 格式</small>
        <input 
          type="file" 
          accept="image/*" 
          hidden
          onChange={handleParseImageSelect}
        />
      </label>
    )}
  </div>
  
  {/* 用户意图输入 */}
  {parseImagePreview && (
    <div className="analysis-intent-input">
      <label>
        <span className="template-form-label-text">解析要求（可选）</span>
        <textarea
          value={parseIntent}
          onChange={(e) => setParseIntent(e.target.value)}
          placeholder="例如：请重点分析人物的表情和光线氛围..."
          rows={3}
          disabled={parsing}
        />
      </label>
    </div>
  )}
  
  {/* 解析按钮 */}
  {parseImagePreview && !parseResult && (
    <button 
      type="button"
      className="analysis-execute-btn"
      onClick={executeImageParse}
      disabled={parsing}
    >
      {parsing ? "解析中..." : "开始解析"}
    </button>
  )}
  
  {/* 解析结果展示 */}
  {parseResult && (
    <div className="analysis-result">
      <div className="analysis-result-header">
        <strong>解析结果</strong>
      </div>
      
      {/* 图像分析总结 */}
      {parseResult.analysisSummary && (
        <div className="analysis-section">
          <span className="analysis-section-title">图像分析</span>
          <p className="analysis-summary">{parseResult.analysisSummary}</p>
        </div>
      )}
      
      {/* 提取的标签 */}
      {parseResult.tags && parseResult.tags.length > 0 && (
        <div className="analysis-section">
          <span className="analysis-section-title">提取的标签</span>
          <div className="analysis-tags">
            {parseResult.tags.map((tag, index) => (
              <div key={index} className="analysis-tag-item">
                <span className="analysis-tag-name">{tag.tagName}:</span>
                <span className="analysis-tag-value">{tag.tagValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 保存按钮 */}
      <button 
        type="button"
        className="analysis-save-btn"
        onClick={saveParseToDraftStorage}
      >
        保存草稿并打开构建器
      </button>
    </div>
  )}
</div>}</aside></div>}
    {/* 草稿发布弹窗：复用创作页的"发布提示词"弹窗，发布成功后删除对应草稿。 */}
    {publishDraft && (
      <TemplatePublishModal
        onClose={() => setPublishDraft(null)}
        prompt={publishDraft.prompt}
        tags={publishDraft.tags || []}
        coverImages={(publishDraft.references || []).map((item) => item.url).filter(Boolean)}
        referenceSlots={(publishDraft.references || []).map((item, index) => ({ slotKey: `reference_${index + 1}`, label: item.name || `参考图${index + 1}`, required: false, maxCount: 1 }))}
        modelDefaults={{ model: publishDraft.model || "gpt-image-2", mode: publishDraft.mode || "文本生图" }}
        onPublished={() => {
          deleteDraft(publishDraft.id);
          refreshDrafts();
          setPublishDraft(null);
        }}
      />
    )}
    {/* 图像解析服务暂未放开：点击入口仅提示开发中，不打开解析抽屉。 */}
    {analysisDisabledOpen && (
      <Modal title="图像解析" onClose={() => setAnalysisDisabledOpen(false)}>
        <div className="analysis-disabled-body">
          <p className="analysis-disabled-message">此服务正在开发中……</p>
          <p className="analysis-disabled-hint">上线后即可上传参考图，反向拆解提示词。敬请期待。</p>
          <button
            type="button"
            className="analysis-disabled-confirm"
            onClick={() => setAnalysisDisabledOpen(false)}
          >
            我知道了
          </button>
        </div>
      </Modal>
    )}
    {/* 封面大图预览：支持滚轮/按钮缩放与拖动查看。 */}
    {previewImage && <ImagePreview result={{ image: previewImage.src, title: previewImage.title }} filename={`${previewImage.title}.png`} onClose={() => setPreviewImage(null)} />}
  </section>;
}
