import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCachedState, useStore } from "../../store/AppStore";
import { ImagePreview } from "../../features/legacy/LegacyApp";
import SelectField from "../SelectField";
import { loadDraft, deleteDraft, saveDraft as saveDraftToStorage } from "../../utils/draftStorage";
import "./ImgsPromptPage.css";
import "./ImgsPromptPage.responsive.css";

const GROUPS = {
  "主体对象": {
    icon: "◌",
    groups: {
      "主体信息": ["主体类型", "主体数量", "主体关系"],
      "外观与行为": ["外观特征", "服饰配件", "表情状态", "动作姿态"]
    }
  },
  "构图与画面结构": {
    icon: "▦",
    groups: {
      "画面布局": ["构图方式", "主体位置", "画面重心", "留白空间"],
      "镜头语言": ["景别范围", "拍摄视角", "镜头焦段"]
    }
  },
  "光线与光影氛围": {
    icon: "☼",
    groups: {
      "光线设置": ["光源类型", "光线方向", "光线质感", "光影对比"],
      "色彩氛围": ["整体色调", "色彩倾向", "色彩饱和度"]
    }
  },
  "环境与背景": {
    icon: "⌂",
    groups: {
      "场景设定": ["场景地点", "空间类型", "时代背景"],
      "环境状态": ["天气状况", "时间氛围", "环境动态"],
      "背景处理": ["背景内容", "景深效果", "背景色彩"]
    }
  },
  "艺术风格": {
    icon: "✳",
    groups: {
      "风格方向": ["整体风格", "参考流派", "时代气质"],
      "表现媒介": ["媒介形式", "渲染方式", "笔触质感"]
    }
  },
  "氛围与效果": {
    icon: "✦",
    groups: {
      "情绪氛围": ["情绪基调", "氛围强度", "叙事气质"],
      "画面约束": ["负面元素", "细节要求", "输出质量"]
    }
  },
  "自定义标签": {
    icon: "+",
    groups: { "我的标签": ["添加自定义标签"] }
  }
};

/** 查找字段分隔冒号的位置：跳过 [序号:图片名] 参考图标记内部的冒号，避免用户输入被误解析为标签芯片。 */
function findFieldSeparator(part) {
  // depth 记录未闭合的 "[" 数量，只有深度为 0 时的冒号才是真正的字段分隔符。
  let depth = 0;
  for (let i = 0; i < part.length; i++) {
    const char = part[i];
    if (char === "[") depth += 1;
    else if (char === "]") depth = Math.max(0, depth - 1);
    else if (char === ":" && depth === 0) return i;
  }
  return -1;
}

function parseChips(value) {
  const source = String(value || "");
  const parsed = source
    .split(/[，\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const userInput = part.match(/^用户输入\s*[：:]\s*(.*)$/);
      if (userInput) return { id: `text-${index}`, type: "text", value: userInput[1].trim() };
      const separator = findFieldSeparator(part);
      if (separator > -1) {
        return {
          id: `field-${index}`,
          type: "field",
          key: part.slice(0, separator).trim(),
          value: part.slice(separator + 1).trim()
        };
      }
      return { id: `text-${index}`, type: "text", value: part };
    });
  const textValue = parsed
    .filter((chip) => chip.type === "text")
    .map((chip) => chip.value)
    .filter(Boolean)
    .join("\n");
  const fields = parsed.filter((chip) => chip.type === "field");
  return textValue ? [{ id: "text-composer", type: "text", value: textValue }, ...fields] : fields;
}

/** HTML 转义，防止用户输入的 <>&"' 破坏芯片结构与属性。 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 将纯文本渲染为芯片 innerHTML，兼容 [图片名] 与 [序号:图片名] 两种参考图标记。 */
function renderChipHtml(text) {
  return escapeHtml(text)
    .replace(/\[(?:(\d+):)?([^\]]+)\]/g, '<span class="chip-ref-mark" contenteditable="false" data-ref="$&">$2</span>')
    .replace(/\n/g, "<br>");
}

/** 将芯片 DOM 序列化回存储格式：普通文本原样，高亮胶囊用 data-ref 还原完整标记，<br> 转换行。 */
function serializeChipContent(element) {
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains("chip-ref-mark")) {
        text += node.dataset.ref || node.textContent;
      } else if (node.tagName === "BR") {
        text += "\n";
      } else {
        text += serializeChipContent(node);
      }
    }
  });
  return text;
}

/** 存储文本 → 显示文本：参考图标记在界面上只显示图片名。 */
function valueToDisplayText(value) {
  return value.replace(/\[(?:\d+:)?([^\]]+)\]/g, "$1");
}

/** 计算两个字符串的公共前缀长度，用于光标位置映射。 */
function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index += 1;
  return index;
}

/** 读取当前光标在元素纯文本中的偏移量；焦点不在元素内时返回 null。 */
function getCaretOffset(element) {
  const selection = window.getSelection();
  if (!selection.rangeCount || !element.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const prefix = document.createRange();
  prefix.selectNodeContents(element);
  prefix.setEnd(range.endContainer, range.endOffset);
  return prefix.toString().length;
}

/** 把光标放到元素纯文本的指定偏移处；偏移超出范围时放到末尾。 */
function setCaretOffset(element, offset) {
  if (offset == null) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    if (remaining <= node.textContent.length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= node.textContent.length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** 粘贴时转为纯文本插入，避免外部富文本带进多余节点与样式。 */
function handleRichPaste(event) {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, text);
}

/** 富文本芯片输入框：contenteditable 实现，[序号:图片名] 关联标记原生高亮，支持中文输入法与光标保持。 */
function RichChipInput({ chipId, value, placeholder, indentStyle, onInput, onKeyDown, onBlur }) {
  const ref = useRef(null);
  const composingRef = useRef(false);
  // 外部 value 变化（如插入 @ 参考图）时同步 DOM；显示域与存储域不同，需要做光标位置映射。
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const currentDisplay = valueToDisplayText(serializeChipContent(element));
    const targetDisplay = valueToDisplayText(value);
    if (currentDisplay === targetDisplay) return;
    // 光标映射：优先保持公共前缀；变化区（如插入的标记）之后按光标后的后缀文本定位。
    const caret = getCaretOffset(element);
    let displayCaret = caret;
    if (caret != null) {
      const suffix = currentDisplay.slice(caret);
      const common = commonPrefixLength(currentDisplay.slice(0, caret), targetDisplay);
      if (!suffix) {
        displayCaret = targetDisplay.length;
      } else {
        const index = targetDisplay.indexOf(suffix, common);
        displayCaret = index === -1 ? targetDisplay.length : index;
      }
    }
    element.innerHTML = renderChipHtml(value);
    setCaretOffset(element, displayCaret);
  }, [value]);
  // 向父级同步存储格式文本；contenteditable 删空后可能残留 <br>，统一归一化为空串。
  const emit = (element) => {
    const text = serializeChipContent(element);
    onInput(chipId, text === "\n" ? "" : text);
  };
  // 键盘处理：先交给外部（@ 菜单导航），外部未拦截时 Enter 负责插入换行。
  const handleKeyDown = (event) => {
    if (onKeyDown) onKeyDown(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };
  return (
    <div
      ref={ref}
      className="rich-input"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      style={indentStyle}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(event) => { composingRef.current = false; emit(event.currentTarget); }}
      onInput={(event) => { if (!composingRef.current) emit(event.currentTarget); }}
      onKeyDown={handleKeyDown}
      onPaste={handleRichPaste}
      onBlur={onBlur}
    />
  );
}

/** 单条提示词芯片：标签悬浮在首行左侧，正文占满整行，换行后文字可延伸到标签下方。 */
function PromptChip({ chip, onInput, onKey, onBlur, onRemove, compactLabel = false }) {
  const labelRef = useRef(null);
  const [indent, setIndent] = useState(0);
  useLayoutEffect(() => {
    // 首行缩进宽度 = 标签实际宽度 + 间距，标签变化（如自定义字段名）时重新测量。
    if (labelRef.current) setIndent(labelRef.current.offsetWidth);
  }, [chip.key]);
  const indentStyle = indent ? { textIndent: `${indent + 8}px` } : undefined;
  return (
    <div className={`prompt-chip ${chip.type === "text" ? "prompt-text-chip" : "prompt-field-chip"} ${compactLabel ? "prompt-chip-compact" : ""}`} data-chip="true">
      <span className="prompt-chip-label" ref={labelRef}>{chip.type === "field" ? `${chip.key}：` : compactLabel ? "用户输入：" : "用户输入："}</span>
      <RichChipInput
        key={chip.id}
        chipId={chip.id}
        value={chip.value}
        placeholder={chip.type === "text" ? "输入提示词内容…" : "输入内容"}
        indentStyle={indentStyle}
        onInput={onInput}
        onKeyDown={onKey}
        onBlur={onBlur}
      />
      {chip.type === "field" && <button type="button" onClick={onRemove} aria-label={`删除${chip.key}`}>×</button>}
    </div>
  );
}

export default function ImgsPromptPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setToast } = useStore();
  
  // 构建器使用独立的本地状态，不再与创作模块共享全局 draft
  const [localDraft, setLocalDraft] = useState({
    prompt: "",
    tags: [],
    references: [],
    model: "gpt-image-2",
    mode: "文本生图"
  });
  const [currentDraftId, setCurrentDraftId] = useState(null);
  
  // 从 URL 参数读取草稿 ID，加载到本地状态
  useEffect(() => {
    const draftId = searchParams.get("draft");
    console.log('[ImgsPromptPage] URL 参数 draftId:', draftId);
    console.log('[ImgsPromptPage] currentDraftId:', currentDraftId);
    if (draftId && draftId !== currentDraftId) {
      const savedDraft = loadDraft(draftId);
      console.log('[ImgsPromptPage] 加载的草稿数据:', savedDraft);
      if (savedDraft) {
        setLocalDraft({
          prompt: savedDraft.prompt || "",
          tags: savedDraft.tags || [],
          references: savedDraft.references || [],
          model: savedDraft.model || "gpt-image-2",
          mode: savedDraft.mode || "文本生图"
        });
        console.log('[ImgsPromptPage] 设置 localDraft，references 长度:', savedDraft.references?.length);
        setCurrentDraftId(draftId);
        setToast(`已加载草稿：${savedDraft.source || "图像解析"}`);
        
        // 移除 URL 参数，避免刷新时重复加载
        searchParams.delete("draft");
        setSearchParams(searchParams, { replace: true });
      } else {
        setToast("草稿不存在或已过期");
      }
    }
  }, [searchParams, setSearchParams, setToast, currentDraftId]);
  
  // 参考图与提示词使用本地状态，与创作模块完全独立
  const references = localDraft.references || [];
  const initialPrompt = localDraft.prompt || "";
  const [active, setActive] = useState("主体对象");
  const [sub, setSub] = useState("主体信息");
  const [chips, setChips] = useState(() => {
    const parsed = parseChips(initialPrompt);
    const textChips = parsed.filter((chip) => chip.type === "text");
    const parsedFields = parsed.filter((chip) => chip.type === "field");
    // 字段芯片从 localDraft.tags 恢复（保存时与提示词文本分开传递），重进页面时还原完整编辑状态。
    const existingKeys = new Set(parsedFields.map((chip) => chip.key));
    const tagFields = (localDraft.tags || []).flatMap((tag, index) => {
      const key = String(tag?.key || "").trim();
      if (!key || existingKeys.has(key)) return [];
      existingKeys.add(key);
      return [{
        id: `field-tag-${key}-${index}`,
        type: "field",
        key,
        value: tag.value || ""
      }];
    });
    const text = textChips.length ? textChips : [{ id: "text-composer", type: "text", value: "" }];
    return [...text, ...parsedFields, ...tagFields];
  });
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customTag, setCustomTag] = useState("");
  // @ 关联菜单状态：null 表示关闭，字符串表示打开（值为 @ 后的查询词，允许为空串）。
  const [mention, setMention] = useState(null);
  // @ 关联参考图的键盘导航：与创作模块一致（↑↓ 选择、Enter 确认、Esc 关闭）。
  const [mentionIndex, setMentionIndex] = useState(0);
  // "返回创作"未保存弹窗：有修改时拦截导航并弹出。
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const mentionChipRef = useRef("text-composer");
  const editorRef = useRef(null);
  // 自由调节布局：左列宽度与参考图模块高度按比例记忆，通过拖拽分隔条调整，跨页保留。
  const layoutRef = useRef(null);
  const [leftRatio, setLeftRatio] = useCachedState("prompt-builder:leftRatio", 0.55);
  const [referenceRatio, setReferenceRatio] = useCachedState("prompt-builder:referenceRatio", 0.32);
  const [previewItem, setPreviewItem] = useState(null);
  // 请求进行中时禁用按钮，避免同一份创作内容被重复提交。
  const [optimizing, setOptimizing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateCategory, setTemplateCategory] = useState("插画");
  const savedSnapshot = useRef(initialPrompt);
  // 分类文案更新后，旧的子分类状态可能仍在首帧渲染中；使用当前分类的首个子分类兜底，避免白屏。
  const activeGroup = GROUPS[active] || GROUPS["主体对象"];
  const subs = Object.keys(activeGroup.groups);
  const currentSub = activeGroup.groups[sub] ? sub : subs[0];
  const tags = activeGroup.groups[currentSub] || [];
  const mentionItems = useMemo(
    () => references.filter((item) =>
      (item.file?.name || item.name || "")
        .toLowerCase()
        .includes((mention || "").toLowerCase())
    ),
    [references, mention]
  );

  useEffect(() => {
    if (sub !== currentSub) setSub(currentSub);
  }, [active, sub, currentSub, subs]);

  // 当草稿加载后，重新解析 chips
  useEffect(() => {
    console.log('[ImgsPromptPage] chips useEffect 触发，currentDraftId:', currentDraftId);
    console.log('[ImgsPromptPage] localDraft.prompt:', localDraft.prompt);
    console.log('[ImgsPromptPage] localDraft.tags:', localDraft.tags);
    if (currentDraftId) {
      const parsed = parseChips(localDraft.prompt || "");
      const textChips = parsed.filter((chip) => chip.type === "text");
      const parsedFields = parsed.filter((chip) => chip.type === "field");
      const existingKeys = new Set(parsedFields.map((chip) => chip.key));
      const tagFields = (localDraft.tags || []).flatMap((tag, index) => {
        const key = String(tag?.key || "").trim();
        if (!key || existingKeys.has(key)) return [];
        existingKeys.add(key);
        return [{
          id: `field-tag-${key}-${index}`,
          type: "field",
          key,
          value: tag.value || ""
        }];
      });
      const text = textChips.length ? textChips : [{ id: "text-composer", type: "text", value: "" }];
      const newChips = [...text, ...parsedFields, ...tagFields];
      console.log('[ImgsPromptPage] 设置新的 chips:', newChips);
      setChips(newChips);
      savedSnapshot.current = localDraft.prompt || "";
    }
  }, [currentDraftId, localDraft.prompt, localDraft.tags]);

  useEffect(() => {
    const saveHandler = () => saveCurrentDraft();
    const publishHandler = () => openTemplateDialog();
    window.addEventListener("imgs-prompt-save", saveHandler);
    window.addEventListener("imgs-prompt-publish", publishHandler);
    return () => {
      window.removeEventListener("imgs-prompt-save", saveHandler);
      window.removeEventListener("imgs-prompt-publish", publishHandler);
    };
  });
  useEffect(() => {
    // 外部创作页带入的内容不会触发 onChange，渲染后统一计算芯片输入框高度。
    const inputs = editorRef.current?.querySelectorAll("textarea") || [];
    inputs.forEach((input) => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    });
  }, [chips]);
  // 拦截"返回创作"链接：有未保存修改时阻止导航并弹出处理弹窗，无修改直接放行。
  useEffect(() => {
    const handler = (event) => {
      if (!event.target.closest?.(".prompt-builder-back")) return;
      if (buildPrompt() !== savedSnapshot.current) {
        event.preventDefault();
        setExitDialogOpen(true);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [chips]);
  useEffect(() => { const input = document.querySelector(".custom-dialog input"); if (input) input.removeAttribute("maxLength"); }, [customDialogOpen]);
  function buildPrompt() {
    return chips
      .map((chip) => chip.type === "field" ? `${chip.key}: ${chip.value || "暂无"}` : chip.value.trim())
      .filter(Boolean)
      .join("\n");
  }
  function addField(key) {
    if (key === "添加自定义标签") {
      setCustomDialogOpen(true);
      return;
    }
    if (chips.some((chip) => chip.type === "field" && chip.key === key)) return;
    setChips((current) => [...current, { id: `field-${Date.now()}`, type: "field", key, value: "" }]);
  }
  function confirmCustomTag() {
    const key = customTag.trim();
    if (!key || chips.some((chip) => chip.type === "field" && chip.key === key)) return;
    setChips((current) => [...current, { id: `field-${Date.now()}`, type: "field", key, value: "" }]);
    setCustomTag("");
    setCustomDialogOpen(false);
  }

  function updateChip(id, value) {
    setChips((current) => current.map((chip) => chip.id === id ? { ...chip, value } : chip));
  }

  function removeChip(id) {
    setChips((current) => {
      const next = current.filter((chip) => chip.id !== id);
      return next.some((chip) => chip.type === "text")
        ? next
        : [...next, { id: "text-composer", type: "text", value: "" }];
    });
  }

  // 保存当前提示词构建状态到 localStorage 草稿：仅保存，不离开当前页面，不影响创作模块。
  function saveCurrentDraft() {
    const composer = chips.find((chip) => chip.type === "text");
    const prompt = composer ? composer.value : "";
    const tags = chips.filter((chip) => chip.type === "field").map((chip) => ({ key: chip.key, value: chip.value }));

    // 保存到 localStorage 草稿；已有草稿 ID 时更新原草稿，否则新建。
    const draftData = {
      prompt,
      tags,
      references,
      model: localDraft.model || "gpt-image-2",
      mode: localDraft.mode || "文本生图",
      source: currentDraftId ? "提示词构建器" : "图像解析",
      type: "parse" // 确保草稿类型正确，以便在草稿列表中显示
    };

    const savedId = saveDraftToStorage(draftData, currentDraftId);

    if (savedId) {
      setCurrentDraftId(savedId);
      savedSnapshot.current = buildPrompt();
      setToast("草稿已保存");
    } else {
      setToast("草稿保存失败");
    }
  }

  /** 打开模板元信息表单；普通保存按钮不会触发模板写入。 */
  function openTemplateDialog() {
    if (!buildPrompt().trim()) {
      setToast("请先填写提示词内容");
      return;
    }
    setTemplateDialogOpen(true);
  }

  /** 将当前构建器的完整结构保存到提示词库，参考图只保存为插槽元数据。 */
  async function saveTemplateToLibrary(metadata = {}) {
    const composer = chips.find((chip) => chip.type === "text");
    const prompt = composer ? composer.value.trim() : "";
    if (!prompt.trim()) {
      setToast("请先填写提示词内容");
      return;
    }
    if (savingTemplate) return;
    setSavingTemplate(true);
    const tags = chips.filter((chip) => chip.type === "field").map((chip) => ({ key: chip.key, value: chip.value || "" }));
    const payload = {
      title: metadata.title?.trim() || "我的提示词模板",
      description: metadata.description?.trim() || "",
      categoryCode: metadata.categoryCode || "插画",
      visibility: metadata.visibility === "public" ? "public" : "private",
      userPromptTemplate: prompt,
      builderSnapshot: { chips },
      referenceSlots: references.map((item, index) => ({ slotKey: `reference_${index + 1}`, label: item.file?.name || item.name || `参考图${index + 1}`, required: false, maxCount: 1 })),
      tags,
      modelDefaults: { model: localDraft.model || "gpt-image-2", mode: localDraft.mode || "文本生图" }
    };
    try {
      const response = await fetch("/prompt_templates", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("模板保存失败");
      // 发布成功后，保存草稿
      saveCurrentDraft();
      setTemplateDialogOpen(false);
      setToast("提示词模板已发布");
    } catch (error) {
      setToast(error.message || "模板保存失败");
    } finally {
      setSavingTemplate(false);
    }
  }

  // 放弃修改并返回创作页
  function discardAndReturn() {
    navigate("/create");
  }

  // 参考图在列表中的序号（从 1 开始），用于生成 [序号:图片名] 关联标记。
  function refIndexOf(item) {
    const name = item.file?.name || item.name || "";
    return references.findIndex((ref) => (ref.file?.name || ref.name || "") === name) + 1;
  }

  function insertReference(item) {
    const name = item.file?.name || item.name || "参考图";
    // 插入到正在输入 @ 的那块芯片：把 @ 及其后的查询词替换为 [序号:图片名]。
    const chipId = mentionChipRef.current;
    setChips((current) => current.map((chip) => chip.id === chipId
      ? { ...chip, value: `${(chip.value || "").replace(/@[^\s@]*$/, "")}[${refIndexOf(item)}:${name}] ` }
      : chip));
    setMention(null);
  }

  function handleChipInput(chipId, text) {
    updateChip(chipId, text);
    const match = text.match(/@([^\s@]*)$/);
    if (match) mentionChipRef.current = chipId;
    setMentionIndex(0);
    // 匹配到 @ 时打开菜单（查询词允许为空串），未匹配时关闭。
    setMention(match ? match[1] : null);
  }

  // 芯片内键盘导航：↑↓ 在候选参考图间循环，Enter 插入选中项，Esc 关闭菜单。
  function handleChipKeyDown(event) {
    if (mention === null || !mentionItems.length) {
      if (event.key === "Escape") setMention(null);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + mentionItems.length) % mentionItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      insertReference(mentionItems[mentionIndex]);
    } else if (event.key === "Escape") {
      setMention(null);
    }
  }

  // 拖拽竖向分隔条：按容器宽度比例调整左列宽度，clamp 保证左右两列的最小尺寸。
  function dragVerticalDivider(event) {
    event.preventDefault();
    const rect = layoutRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (e) => {
      const ratio = (e.clientX - rect.left) / rect.width;
      setLeftRatio(Math.min(0.68, Math.max(0.32, ratio)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  // 拖拽水平分隔条：调整参考图模块在左列中的高度占比，clamp 保证结构区与参考图区的最小高度。
  function dragHorizontalDivider(event) {
    event.preventDefault();
    const pane = event.currentTarget.parentElement;
    const rect = pane?.getBoundingClientRect();
    if (!rect) return;
    const move = (e) => {
      const ratio = (e.clientY - rect.top) / rect.height;
      setReferenceRatio(Math.min(0.66, Math.max(0.2, ratio)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  /** 调用后端优化当前用户输入，并使用模型返回的标签替换编辑区标签。 */
  async function optimizePrompt() {
    const composer = chips.find((chip) => chip.type === "text");
    const userPrompt = String(composer?.value || "").trim();
    if (!userPrompt) {
      setToast("请先输入创作内容");
      return;
    }

    setOptimizing(true);
    try {
      // 后端根据 [序号:文件名] 标记筛选实际关联图并上传到 OSS。
      const form = new FormData();
      form.append("userPrompt", userPrompt);
      references.forEach((item, index) => {
        // 本地 File 直接上传；草稿里存的 OSS URL 传给后端复用，无需重新上传。
        if (item.file instanceof File) {
          form.append("referenceImages", item.file);
          form.append("referenceIndexes", String(index + 1));
        } else if (item.url && !String(item.url).startsWith("blob:")) {
          form.append("referenceUrls", item.url);
          form.append("referenceIndexes", String(index + 1));
        }
      });
      const response = await fetch("/ai/prompts/optimize", {
        method: "POST",
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "提示词优化失败，请稍后重试");
      }
      const optimizedTags = Array.isArray(data.tags_prompt)
        ? data.tags_prompt
        : [];
      if (!optimizedTags.length) {
        throw new Error("未获得可用的优化标签");
      }
      const textChips = chips.filter((chip) => chip.type === "text");
      const tagChips = optimizedTags.map((tag, index) => ({
        id: `field-ai-${Date.now()}-${index}`,
        type: "field",
        key: String(tag.tag_name || "").trim(),
        value: String(tag.tag_value || "").trim()
      })).filter((chip) => chip.key && chip.value);
      setChips([...textChips, ...tagChips]);
      setToast("提示词已优化，请确认标签内容");
    } catch (error) {
      setToast(error.message || "提示词优化失败，请稍后重试");
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <section className="imgs-prompt-page">
      <div className="imgs-prompt-layout" ref={layoutRef}>
        <div className="prompt-left-pane" style={{ width: `${leftRatio * 100}%` }}>
        <section className="tag-workbench">
          <div className="workbench-heading">
            <div>
              <span>提示词结构</span>
              <small>选择要补充的要素</small>
            </div>
            <b>01 / 07</b>
          </div>
          <div className="tag-workbench-body">
            <aside className="level-one">
              {Object.entries(GROUPS).map(([name, group], index) => (
                <button
                  type="button"
                  className={active === name ? "active" : ""}
                  key={name}
                  onClick={() => {
                    setActive(name);
                    setSub(Object.keys(group.groups)[0]);
                  }}
                >
                  <span><i>{group.icon}</i>{name}</span>
                  <em>0{index + 1}</em>
                </button>
              ))}
            </aside>
            <div className="level-two">
              <div className="level-two-head"><span>{active}</span><small>二级分类</small></div>
              <div className="sub-category-list">
                {subs.map((name, index) => (
                  <button className={sub === name ? "active" : ""} type="button" key={name} onClick={() => setSub(name)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>{name}
                  </button>
                ))}
              </div>
              <div className="level-three-head"><span>具体标签</span><small>{active === "自定义标签" ? "点击创建自己的标签" : "点击标签直接加入右侧"}</small></div>
              <div className="tag-grid">
                {tags.map((tag) => (
                  <button type="button" className={`builder-tag ${chips.some((chip) => chip.type === "field" && chip.key === tag) ? "chosen" : ""}`} key={tag} onClick={() => addField(tag)}>
                    <span>{tag}</span>
                    <small>{chips.some((chip) => chip.type === "field" && chip.key === tag) ? "已添加" : active === "自定义标签" ? "点击创建" : "添加"}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        {/* 水平分隔条：拖拽调节提示词结构区与参考图区的高度。 */}
        <div className="pane-divider horizontal" role="separator" aria-orientation="horizontal" onPointerDown={dragHorizontalDivider} />
        {/* 参考图模块：与创作页参考图同步，点击缩略图放大预览（与结果图预览一致）。 */}
        <section className="reference-workbench">
          <div className="reference-workbench-head"><span>参考图</span><small>{references.length ? `${references.length} 张` : "添加参考图后，可在提示词中引用"}</small></div>
          <div className="reference-workbench-grid">
            {references.map((item) => (
              <button type="button" className="reference-thumb" key={item.id || item.name} onClick={() => setPreviewItem({ image: item.url, title: item.file?.name || item.name })}>
                <img src={item.url} alt={item.file?.name || item.name} />
                <span>{item.file?.name || item.name}</span>
              </button>
            ))}
            {!references.length && <p className="reference-empty">暂无参考图，可从草稿中加载或上传图片。</p>}
          </div>
        </section>
        </div>
        {/* 竖向分隔条：拖拽调节左列（标签 + 参考图）与提示词编辑区的宽度。 */}
        <div className="pane-divider vertical" role="separator" aria-orientation="vertical" onPointerDown={dragVerticalDivider} />
        <section className="prompt-workbench">
          <div className="prompt-heading">
            <div><span>提示词编辑</span><small>{chips.filter((chip) => chip.type === "field").length} 个标签已添加</small></div>
            <div className="prompt-heading-input">
              {chips.filter((chip) => chip.type === "text").map((chip) => (
                <PromptChip
                  key={chip.id}
                  chip={chip}
                  onInput={handleChipInput}
                  onKey={handleChipKeyDown}
                  onBlur={() => setMention(null)}
                  onRemove={() => removeChip(chip.id)}
                  compactLabel
                />
              ))}
            </div>
            <div className="prompt-actions">
              <button type="button" className="optimize-prompt-button" onClick={optimizePrompt} disabled={optimizing}><Sparkles size={14} />{optimizing ? "优化中…" : "优化提示词"}</button>
            </div>
          </div>
          <div className="editor-wrap">
            <div ref={editorRef} className="prompt-editor-surface prompt-rich-editor">
              {chips.filter((chip) => chip.type === "field").map((chip) => (
                <PromptChip
                  key={chip.id}
                  chip={chip}
                  onInput={handleChipInput}
                  onKey={handleChipKeyDown}
                  onBlur={() => setMention(null)}
                  onRemove={() => removeChip(chip.id)}
                />
              ))}
            </div>
            {mention !== null && (
              <div className="prompt-mention-menu">
                <small>关联参考图 · ↑↓ 选择，Enter 确认</small>
                {mentionItems.length ? mentionItems.map((item, index) => (
                  <button type="button" className={index === mentionIndex ? "active" : ""} key={item.id || item.name} onMouseDown={(event) => { event.preventDefault(); insertReference(item); }}>
                    <img src={item.url} alt="" />{item.file?.name || item.name}
                  </button>
                )) : <p className="mention-empty">暂无可关联的参考图，请先在创作页添加</p>}
              </div>
            )}
          </div>
          <div className="prompt-status"><span><i />自动保存</span></div>
        </section>
      </div>
      {/* 参考图放大预览：复用结果图的预览组件（滚轮缩放、拖动、Esc 关闭）。 */}
      {previewItem && <ImagePreview result={previewItem} filename={previewItem.title || "参考图"} onClose={() => setPreviewItem(null)} />}
      {/* 返回创作弹窗：提示未保存修改，选择"保存并返回"或"不保存"。 */}
      {exitDialogOpen && (
        <div className="custom-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExitDialogOpen(false); }}>
          <div className="custom-dialog exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-dialog-title">
            <div className="custom-dialog-icon"><Save size={16} /></div>
            <h2 id="exit-dialog-title">返回创作</h2>
            <p>当前有未保存的草稿修改，是否保存到草稿？</p>
            <div className="custom-dialog-actions">
              <button type="button" onClick={() => { setExitDialogOpen(false); discardAndReturn(); }}>不保存</button>
              <button type="button" className="confirm" onClick={() => { setExitDialogOpen(false); saveCurrentDraft(); navigate("/create"); }}>保存草稿并返回</button>
            </div>
          </div>
        </div>
      )}
      {customDialogOpen && (
        <div className="custom-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomDialogOpen(false); }}>
          <div className="custom-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-dialog-title">
            <div className="custom-dialog-icon">+</div>
            <h2 id="custom-dialog-title">新建自定义标签</h2>
            <p>添加一个专属于当前创作的提示词要素。</p>
            <label><span>标签名称</span><input autoFocus value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmCustomTag(); if (event.key === "Escape") setCustomDialogOpen(false); }} placeholder="例如：画面细节" maxLength={24} /></label>
            <div className="custom-dialog-actions">
              <button type="button" onClick={() => { setCustomDialogOpen(false); setCustomTag(""); }}>取消</button>
              <button type="button" className="confirm" onClick={confirmCustomTag} disabled={!customTag.trim()}>创建标签</button>
            </div>
          </div>
        </div>
      )}
      {templateDialogOpen && (
        <div className="custom-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplateDialogOpen(false); }}>
          <form className="custom-dialog template-save-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); saveTemplateToLibrary({ title: form.get("title"), description: form.get("description"), categoryCode: templateCategory, visibility: form.get("visibility") === "public" ? "public" : "private" }); }}>
            <div className="custom-dialog-icon"><Save size={16} /></div>
            <h2>发布到提示词模板</h2>
            <p>补充模板信息后，保存为可重复使用的提示词。</p>
            <label><span>模板名称</span><input name="title" autoFocus placeholder="例如：人物动作保持" required maxLength={80} /></label>
            <label><span>模板简介</span><textarea name="description" placeholder="说明模板适合的场景和用途" maxLength={240} /></label>
            <SelectField className="template-category-field" label="模板分类" value={templateCategory} options={["插画", "头像", "海报", "壁纸", "明信片"]} onChange={setTemplateCategory} />
            <label className="template-visibility"><input name="visibility" value="public" type="checkbox" />公开模板</label>
            <div className="custom-dialog-actions"><button type="button" onClick={() => setTemplateDialogOpen(false)}>取消</button><button type="submit" className="confirm" disabled={savingTemplate}>{savingTemplate ? "发布中…" : "发布模板"}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
