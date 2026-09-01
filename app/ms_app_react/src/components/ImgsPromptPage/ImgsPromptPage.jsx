import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Save, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCachedState, useStore } from "../../store/AppStore";
import { ImagePreview } from "../../features/legacy/LegacyApp";
import "./ImgsPromptPage.css";
import "./ImgsPromptPage.responsive.css";

const GROUPS = {
  "主体对象": {
    icon: "◌",
    groups: {
      "角色": ["角色", "身份", "数量"],
      "外观细节": ["发型", "服饰", "面部表情", "动作"]
    }
  },
  "构图与画面结构": {
    icon: "▦",
    groups: {
      "画面构图": ["三分法", "对称构图", "引导线", "对角线", "中心构图"],
      "景别": ["全景", "远景", "中景", "半身", "特写"],
      "视角": ["平视", "俯视", "仰拍", "鸟瞰", "低角度"]
    }
  },
  "光线与光影氛围": {
    icon: "☼",
    groups: {
      "光源类型": ["自然光", "黄金时", "黎明", "月光", "霓虹灯", "烛光"],
      "光照强度": ["柔和漫光", "硬阴影", "高对比度", "低对比度"],
      "色彩色调": ["冷色调", "暖色调", "高饱和", "低饱和"]
    }
  },
  "环境 & 背景": {
    icon: "⌂",
    groups: {
      "场景环境": ["室内", "森林", "废墟", "都市街道", "星空宇宙"],
      "环境状态": ["下雨", "下雪", "大雾", "沙尘暴", "清晨", "午夜"],
      "背景处理": ["复杂背景", "虚化背景", "纯色背景"]
    }
  },
  "艺术风格": {
    icon: "✳",
    groups: {
      "美术流派": ["印象派", "赛博朋克", "日式二次元", "国风厚涂", "水彩", "油画"],
      "媒介载体": ["胶片摄影", "数字摄影", "水墨画", "钢笔速写", "3D渲染"],
      "质感画风": ["手绘笔触", "平滑渲染", "颗粒噪点"]
    }
  },
  "氛围 & 特殊": {
    icon: "✦",
    groups: {
      "氛围": ["孤寂", "浪漫", "压迫感", "治愈", "史诗感", "诡异", "静谧", "热烈"],
      "特殊": ["畸形肢体", "扭曲手部", "模糊", "水印", "文字", "低画质"]
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

/** 将纯文本渲染为芯片 innerHTML：[序号:图片名] 渲染为原子高亮胶囊（仅显示图片名），换行转为 <br>。 */
function renderChipHtml(text) {
  return escapeHtml(text)
    .replace(/\[(\d+):([^\]]+)\]/g, '<span class="chip-ref-mark" contenteditable="false" data-ref="[$1:$2]">$2</span>')
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

/** 存储文本 → 显示文本：[序号:图片名] 在界面上只显示图片名。 */
function valueToDisplayText(value) {
  return value.replace(/\[\d+:([^\]]+)\]/g, "$1");
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
function PromptChip({ chip, onInput, onKey, onBlur, onRemove }) {
  const labelRef = useRef(null);
  const [indent, setIndent] = useState(0);
  useLayoutEffect(() => {
    // 首行缩进宽度 = 标签实际宽度 + 间距，标签变化（如自定义字段名）时重新测量。
    if (labelRef.current) setIndent(labelRef.current.offsetWidth);
  }, [chip.key]);
  const indentStyle = indent ? { textIndent: `${indent + 8}px` } : undefined;
  return (
    <div className={`prompt-chip ${chip.type === "text" ? "prompt-text-chip" : "prompt-field-chip"}`} data-chip="true">
      <span className="prompt-chip-label" ref={labelRef}>{chip.type === "field" ? `${chip.key}：` : "用户输入："}</span>
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
  const { draft, setDraft, setToast } = useStore();
  // 参考图与提示词统一从全局草稿读取，与创作页保持同一份数据，避免路由切换导致不一致。
  const references = draft.references || [];
  const initialPrompt = draft.prompt || "";
  const [active, setActive] = useState("主体对象");
  const [sub, setSub] = useState("角色");
  const [chips, setChips] = useState(() => {
    const parsed = parseChips(initialPrompt);
    const textChips = parsed.filter((chip) => chip.type === "text");
    const parsedFields = parsed.filter((chip) => chip.type === "field");
    // 字段芯片从 draft.tags 恢复（保存时与提示词文本分开传递），重进页面时还原完整编辑状态。
    const tagFields = (draft.tags || [])
      .filter((tag) => !parsedFields.some((chip) => chip.key === tag.key))
      .map((tag) => ({ id: `field-tag-${tag.key}`, type: "field", key: tag.key, value: tag.value || "" }));
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
  const savedSnapshot = useRef(initialPrompt);
  const subs = Object.keys(GROUPS[active].groups);
  const tags = GROUPS[active].groups[sub];
  const mentionItems = useMemo(
    () => references.filter((item) =>
      (item.file?.name || item.name || "")
        .toLowerCase()
        .includes((mention || "").toLowerCase())
    ),
    [references, mention]
  );

  useEffect(() => {
    if (!subs.includes(sub)) setSub(subs[0]);
  }, [active, subs]);

  useEffect(() => {
    const handler = () => saveDraft();
    window.addEventListener("imgs-prompt-save", handler);
    return () => window.removeEventListener("imgs-prompt-save", handler);
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

  // 保存当前提示词构建状态到全局草稿：仅保存，不离开当前页面。
  function saveDraft() {
    // 仅将"用户输入"芯片的内容作为提示词带回创作页；标签通过 tags 单独传递，仅用于标签栏展示。
    const composer = chips.find((chip) => chip.type === "text");
    const prompt = composer ? composer.value : "";
    const tags = chips.filter((chip) => chip.type === "field").map((chip) => ({ key: chip.key, value: chip.value }));
    setDraft({ ...draft, prompt, tags });
    // 快照存完整构建结果（含字段芯片），保证保存后返回创作页时不再误报"未保存"。
    savedSnapshot.current = buildPrompt();
    setToast("提示词已保存");
  }

  // 保存并返回创作页：用于退出确认弹窗中的"保存并返回"。
  function saveAndReturn() {
    saveDraft();
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
          <div className="reference-workbench-head"><span>参考图</span><small>{references.length ? `${references.length} 张 · 与创作同步` : "与创作模块的参考图同步"}</small></div>
          <div className="reference-workbench-grid">
            {references.map((item) => (
              <button type="button" className="reference-thumb" key={item.id || item.name} onClick={() => setPreviewItem({ image: item.url, title: item.file?.name || item.name })}>
                <img src={item.url} alt={item.file?.name || item.name} />
                <span>{item.file?.name || item.name}</span>
              </button>
            ))}
            {!references.length && <p className="reference-empty">在创作页添加参考图后，这里会同步显示。</p>}
          </div>
        </section>
        </div>
        {/* 竖向分隔条：拖拽调节左列（标签 + 参考图）与提示词编辑区的宽度。 */}
        <div className="pane-divider vertical" role="separator" aria-orientation="vertical" onPointerDown={dragVerticalDivider} />
        <section className="prompt-workbench">
          <div className="prompt-heading">
            <div><span>提示词编辑</span><small>{chips.filter((chip) => chip.type === "field").length} 个标签已添加</small></div>
            <div className="prompt-actions">
              <button type="button" className="optimize-prompt-button" onClick={() => setToast("LLM 优化功能即将上线")}><Sparkles size={14} />优化提示词</button>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(buildPrompt()); setToast("提示词已复制"); }} title="复制提示词"><Copy size={15} /></button>
              <button type="button" onClick={() => { setChips([{ id: "text-composer", type: "text", value: "" }]); setMention(null); }} title="清空提示词"><X size={16} /></button>
            </div>
          </div>
          <div className="editor-wrap">
            <div ref={editorRef} className="prompt-editor-surface prompt-rich-editor">
              {chips.map((chip) => (
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
            <p>当前有未保存的提示词修改，请选择如何处理。</p>
            <div className="custom-dialog-actions">
              <button type="button" onClick={() => { setExitDialogOpen(false); navigate("/create"); }}>不保存</button>
              <button type="button" className="confirm" onClick={() => { setExitDialogOpen(false); saveAndReturn(); }}>保存并返回</button>
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
    </section>
  );
}
