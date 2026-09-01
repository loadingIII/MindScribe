import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Save, Sparkles, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../../store/AppStore";
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

function parseChips(value) {
  const source = String(value || "");
  const parsed = source
    .split(/[，\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => {
      const userInput = part.match(/^用户输入\s*[：:]\s*(.*)$/);
      if (userInput) return { id: `text-${index}`, type: "text", value: userInput[1].trim() };
      const separator = part.indexOf(":");
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

/** 单条提示词芯片：标签悬浮在首行左侧，正文占满整行，换行后文字可延伸到标签下方。 */
function PromptChip({ chip, onResize, onTextInput, onRemove }) {
  const labelRef = useRef(null);
  const [indent, setIndent] = useState(0);
  useLayoutEffect(() => {
    // 首行缩进宽度 = 标签实际宽度 + 间距，标签变化（如自定义字段名）时重新测量。
    if (labelRef.current) setIndent(labelRef.current.offsetWidth);
  }, [chip.key]);
  return (
    <span className={`prompt-chip ${chip.type === "text" ? "prompt-text-chip" : "prompt-field-chip"}`} data-chip="true">
      <span className="prompt-chip-label" ref={labelRef}>{chip.type === "field" ? `${chip.key}：` : "用户输入："}</span>
      <textarea
        data-chip-id={chip.id}
        value={chip.value}
        placeholder={chip.type === "text" ? "输入提示词内容…" : "输入内容"}
        rows={1}
        style={indent ? { textIndent: `${indent + 8}px` } : undefined}
        onChange={onResize}
        onInput={onTextInput}
      />
      {chip.type === "field" && <button type="button" onClick={onRemove} aria-label={`删除${chip.key}`}>×</button>}
    </span>
  );
}

export default function ImgsPromptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { draft, setDraft, setToast } = useStore();
  const references = location.state?.references || [];
  const initialPrompt = location.state?.prompt || draft.prompt || "";
  const [active, setActive] = useState("主体对象");
  const [sub, setSub] = useState("角色");
  const [chips, setChips] = useState(() => {
    const parsed = parseChips(initialPrompt);
    return parsed.some((chip) => chip.type === "text")
      ? parsed
      : [...parsed, { id: "text-composer", type: "text", value: "" }];
  });
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customTag, setCustomTag] = useState("");
  const [mention, setMention] = useState("");
  const editorRef = useRef(null);
  const savedSnapshot = useRef(initialPrompt);
  const subs = Object.keys(GROUPS[active].groups);
  const tags = GROUPS[active].groups[sub];
  const mentionItems = useMemo(
    () => references.filter((item) =>
      (item.file?.name || item.name || "")
        .toLowerCase()
        .includes(mention.toLowerCase())
    ),
    [references, mention]
  );

  useEffect(() => {
    if (!subs.includes(sub)) setSub(subs[0]);
  }, [active, subs]);

  useEffect(() => {
    const handler = () => saveAndReturn();
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
  useEffect(() => { const handler = (event) => { if (!event.target.closest?.(".prompt-builder-back")) return; if (buildPrompt() !== savedSnapshot.current && !window.confirm("当前有未保存的提示词修改，确定要返回创作吗？")) event.preventDefault(); }; document.addEventListener("click", handler, true); return () => document.removeEventListener("click", handler, true); }, [chips]);
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

  function resizeField(event, id) {
    const element = event.currentTarget;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    updateChip(id, element.value);
  }

  function removeChip(id) {
    setChips((current) => {
      const next = current.filter((chip) => chip.id !== id);
      return next.some((chip) => chip.type === "text")
        ? next
        : [...next, { id: "text-composer", type: "text", value: "" }];
    });
  }

  function saveAndReturn() {
    const prompt = buildPrompt();
    savedSnapshot.current = prompt;
    setDraft({ ...draft, prompt });
    setToast("提示词已保存");
    navigate("/create");
  }

  function insertReference(item) {
    const name = item.file?.name || item.name || "参考图";
    const textChip = chips.find((chip) => chip.type === "text");
    const currentText = textChip?.value || "";
    const next = `${currentText.replace(/@[^\s@]*$/, "")}[${name}] `;
    if (textChip) setChips((current) => current.map((chip) => chip.id === textChip.id ? { ...chip, value: next } : chip));
    setMention("");
  }

  function handleTextInput(event) {
    const text = event.currentTarget.value;
    updateChip(event.currentTarget.dataset.chipId, text);
    const match = text.match(/@([^\s@]*)$/);
    const nextMention = match ? match[1] : "";
    setMention((current) => current === nextMention ? current : nextMention);
  }

  return (
    <section className="imgs-prompt-page">
      <div className="imgs-prompt-layout">
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
        <section className="prompt-workbench">
          <div className="prompt-heading">
            <div><span>提示词编辑</span><small>{chips.filter((chip) => chip.type === "field").length} 个标签已添加</small></div>
            <div className="prompt-actions">
              <button type="button" className="optimize-prompt-button" onClick={() => setToast("LLM 优化功能即将上线")}><Sparkles size={14} />优化提示词</button>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(buildPrompt()); setToast("提示词已复制"); }} title="复制提示词"><Copy size={15} /></button>
              <button type="button" onClick={() => { setChips([{ id: "text-composer", type: "text", value: "" }]); setMention(""); }} title="清空提示词"><X size={16} /></button>
            </div>
          </div>
          <div className="editor-wrap">
            <div ref={editorRef} className="prompt-editor-surface prompt-rich-editor">
              {chips.map((chip) => (
                <PromptChip
                  key={chip.id}
                  chip={chip}
                  onResize={(event) => resizeField(event, chip.id)}
                  onTextInput={chip.type === "text" ? handleTextInput : undefined}
                  onRemove={() => removeChip(chip.id)}
                />
              ))}
            </div>
            {mention && mentionItems.length > 0 && (
              <div className="prompt-mention-menu">
                <small>关联参考图</small>
                {mentionItems.map((item) => (
                  <button type="button" key={item.id || item.name} onMouseDown={(event) => { event.preventDefault(); insertReference(item); }}>
                    <img src={item.url} alt="" />{item.file?.name || item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="prompt-status"><span><i />自动保存</span></div>
        </section>
      </div>
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
