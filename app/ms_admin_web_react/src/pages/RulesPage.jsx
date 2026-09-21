import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import { api } from "../api";

// 客户端实际可选的尺寸取值，预设列出避免管理员手写 JSON。
const SIZE_PRESETS = [
  { value: "auto", label: "自动（auto）" },
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "2048x2048", label: "2048 × 2048" },
  { value: "1536x1024", label: "1536 × 1024" },
  { value: "2048x1152", label: "2048 × 1152" },
  { value: "3840x2160", label: "3840 × 2160" },
  { value: "1024x1536", label: "1024 × 1536" },
  { value: "2160x3840", label: "2160 × 3840" }
];

// 客户端实际可选的质量档位。
const QUALITY_PRESETS = [
  { value: "auto", label: "自动（auto）" },
  { value: "low", label: "低（low）" },
  { value: "medium", label: "中（medium）" },
  { value: "high", label: "高（high）" }
];

// 全部预设取值 → 中文标签的映射，列表页徽章展示用。
const PRESET_LABELS = new Map([...SIZE_PRESETS, ...QUALITY_PRESETS].map((item) => [item.value, item.label]));

// 新建规则的默认系数：尺寸仅自动，质量按高中低递减。
const EMPTY_FORM = {
  action: "image_generation",
  model: "",
  baseCost: 20,
  img2imgCost: 30,
  sizeEntries: parseMultiplierEntries('{"auto": 1}'),
  qualityEntries: parseMultiplierEntries('{"high": 1, "medium": 0.8, "low": 0.6}'),
  isActive: true,
  remark: ""
};

/** 取出取值的展示标签；非预设的自定义取值按原文显示。 */
function presetLabel(key) {
  return PRESET_LABELS.get(key) || key;
}

/** 系数数字转为简洁文本：1 → "1"，0.8 → "0.8"，非法值按 1。 */
function formatFactor(value) {
  const number = Number(value);
  return String(Number.isFinite(number) ? number : 1);
}

/** 把后端返回的系数 JSON 解析成行条目；预设排前面，历史自定义取值原样保留。 */
function parseMultiplierEntries(json) {
  let factors = {};
  try { factors = JSON.parse(json || "{}"); } catch { /* 历史脏数据按空处理，保存时会重建。 */ }
  const all = Object.entries(factors).map(([key, value]) => ({
    key,
    value: formatFactor(value),
    custom: !PRESET_LABELS.has(key)
  }));
  // 预设取值按预设顺序排列，自定义的排在最后，列表更整齐。
  const presetOrder = [...PRESET_LABELS.keys()];
  return all.sort((left, right) => {
    const leftIndex = left.custom ? presetOrder.length : presetOrder.indexOf(left.key);
    const rightIndex = right.custom ? presetOrder.length : presetOrder.indexOf(right.key);
    return leftIndex - rightIndex;
  });
}

/** 把行条目序列化回后端需要的 JSON 字符串；校验失败时抛出中文提示。 */
function serializeMultiplierEntries(entries, fieldName) {
  const factors = {};
  for (const entry of entries) {
    const key = String(entry.key || "").trim();
    if (!key) throw new Error(`请为「${fieldName}」的每一行选择或填写取值`);
    if (Object.prototype.hasOwnProperty.call(factors, key)) throw new Error(`「${fieldName}」存在重复取值：${key}`);
    const number = Number(entry.value);
    if (entry.value === "" || !Number.isFinite(number) || number < 0) {
      throw new Error(`「${fieldName}」的系数必须是 0 以上的数字`);
    }
    factors[key] = number;
  }
  return JSON.stringify(factors);
}

/** 系数编辑块：标题 + 逐行「取值 × 系数」+ 添加按钮，替代手写 JSON。 */
function FactorEditor({ title, hint, presets, entries, onChange }) {
  // 已占用的预设取值要在每行下拉里禁用，避免两条系数互相覆盖。
  const usedKeys = new Set(entries.filter((entry) => !entry.custom).map((entry) => entry.key));

  /** 更新某一行的字段。 */
  function updateEntry(index, patch) {
    onChange(entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  return <div className="factor-block">
    <div className="factor-head">
      <span>{title}<i className="factor-hint">{hint}</i></span>
      <button type="button" className="factor-add" onClick={() => onChange([...entries, { key: "", value: "1", custom: false }])}>
        <Plus size={13} />添加取值
      </button>
    </div>
    {entries.map((entry, index) => <div className="factor-row" key={index}>
      {entry.custom
        ? <input value={entry.key} placeholder="自定义取值，如 4096x2160" onChange={(event) => updateEntry(index, { key: event.target.value })} />
        : <select value={entry.key} onChange={(event) => {
            // 选择“自定义”时切换成文本输入；选择预设时直接写入取值。
            if (event.target.value === "__custom__") { updateEntry(index, { key: "", custom: true }); return; }
            updateEntry(index, { key: event.target.value, custom: false });
          }}>
            <option value="" disabled>请选择取值</option>
            {presets.map((preset) => <option key={preset.value} value={preset.value} disabled={usedKeys.has(preset.value) && preset.value !== entry.key}>{preset.label}</option>)}
            <option value="__custom__">自定义…</option>
          </select>}
      <span className="factor-times">×</span>
      <input type="number" min="0" step="0.05" value={entry.value} onChange={(event) => updateEntry(index, { value: event.target.value })} />
      <button type="button" className="factor-remove" title="删除该取值" onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))}><X size={14} /></button>
    </div>)}
    {!entries.length && <p className="factor-empty">未配置任何取值，全部按系数 1.0 计价。</p>}
  </div>;
}

/** 计价规则页：列表 + 新建/编辑弹层；保存后同进程热更新，无需重启服务。 */
export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async function load() {
    try { setRules(await api.get("/admin/pricing/rules")); setError(""); }
    catch (loadError) { setError(loadError.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2500);
  }

  /** 打开弹层：新建用默认模板，编辑把系数 JSON 还原成可编辑的行。 */
  function openEditor(rule) {
    setFormError("");
    setEditing(rule ? {
      ...rule,
      sizeEntries: parseMultiplierEntries(rule.sizeMultipliers),
      qualityEntries: parseMultiplierEntries(rule.qualityMultipliers)
    } : { ...EMPTY_FORM });
  }

  /** 保存表单：区分新建与编辑；系数取值重复或非法时在弹层内提示。 */
  async function save(event) {
    event.preventDefault();
    let sizeMultipliers;
    let qualityMultipliers;
    try {
      sizeMultipliers = serializeMultiplierEntries(editing.sizeEntries, "尺寸系数");
      qualityMultipliers = serializeMultiplierEntries(editing.qualityEntries, "质量系数");
    } catch (validError) {
      setFormError(validError.message);
      return;
    }
    try {
      const payload = { ...editing, sizeMultipliers, qualityMultipliers };
      if (editing.id) {
        await api.put(`/admin/pricing/rules/${editing.id}`, payload);
        flash("规则已保存并即时生效");
      } else {
        await api.post("/admin/pricing/rules", payload);
        flash("规则已创建并即时生效");
      }
      setEditing(null);
      load();
    } catch (saveError) {
      setFormError(saveError.message || "保存失败，请稍后重试");
    }
  }

  async function deactivate(rule) {
    if (rule.model === "default" && !window.confirm("default 是兜底规则，停用后未配置的模型将无法计价，确定停用？")) return;
    if (!window.confirm(`确认停用规则 ${rule.action} / ${rule.model}？`)) return;
    try { await api.delete(`/admin/pricing/rules/${rule.id}`); flash("规则已停用并即时生效"); load(); }
    catch (requestError) { setError(requestError.message); }
  }

  /** 列表页系数徽章：把 JSON 映射转成“取值 ×系数”的可读短标签。 */
  function factorChips(json) {
    const entries = parseMultiplierEntries(json);
    if (!entries.length) return <span className="muted-note">未配置，按 1.0</span>;
    return <span className="factor-chips">
      {entries.map((entry) => <span className="factor-chip" key={entry.key} title={`${entry.key} = ${entry.value}`}>
        {presetLabel(entry.key)} ×{formatFactor(entry.value)}
      </span>)}
    </span>;
  }

  return <section className="panel">
    <header className="panel-head">
      <div><h2>计价规则</h2><p>保存后立即生效，无需重启服务；未配置的尺寸/质量按系数 1.0 计价。</p></div>
      <div className="panel-actions">
        <button type="button" className="ghost" onClick={load}><RefreshCw size={15} />刷新</button>
        <button type="button" onClick={() => openEditor(null)}><Plus size={15} />新建规则</button>
      </div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-ok">{message}</p>}
    <table>
      <thead><tr>
        <th>动作</th><th>模型</th><th>文生图/张</th><th>图生图/张</th>
        <th>尺寸系数</th><th>质量系数</th><th>状态</th><th>备注</th><th></th>
      </tr></thead>
      <tbody>
        {rules.map((rule) => <tr key={rule.id} className={rule.isActive ? "" : "muted"}>
          <td>{rule.action}</td><td><b>{rule.model}</b></td>
          <td>{rule.baseCost}</td><td>{rule.img2imgCost}</td>
          <td>{factorChips(rule.sizeMultipliers)}</td>
          <td>{factorChips(rule.qualityMultipliers)}</td>
          <td>{rule.isActive ? <span className="badge ok">生效中</span> : <span className="badge">已停用</span>}</td>
          <td>{rule.remark || "—"}</td>
          <td className="row-actions">
            <button type="button" className="ghost" onClick={() => openEditor(rule)}>编辑</button>
            {rule.isActive && <button type="button" className="danger ghost" onClick={() => deactivate(rule)}>停用</button>}
          </td>
        </tr>)}
        {!rules.length && <tr><td colSpan={9} className="empty">暂无规则，请先新建。</td></tr>}
      </tbody>
    </table>

    {editing && <div className="modal-mask" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={save}>
        <h3>{editing.id ? "编辑规则" : "新建规则"}</h3>
        <p className="modal-hint">最终价格 = 基准价 × 尺寸系数 × 质量系数（单张向上取整）；未配置的取值按 ×1.0 计价。</p>
        <div className="grid2">
          <label><span>计费动作</span>
            <select value={editing.action} disabled={Boolean(editing.id)} onChange={(event) => setEditing({ ...editing, action: event.target.value })}>
              <option value="image_generation">image_generation（生图）</option>
            </select>
          </label>
          <label><span>模型名（default 为兜底）</span>
            <input value={editing.model} disabled={Boolean(editing.id)} onChange={(event) => setEditing({ ...editing, model: event.target.value })} placeholder="gpt-image-2" />
          </label>
          <label><span>文生图基准价/张</span><input type="number" min="0" value={editing.baseCost} onChange={(event) => setEditing({ ...editing, baseCost: Number(event.target.value) })} /></label>
          <label><span>图生图基准价/张</span><input type="number" min="0" value={editing.img2imgCost} onChange={(event) => setEditing({ ...editing, img2imgCost: Number(event.target.value) })} /></label>
        </div>
        <FactorEditor
          title="尺寸系数"
          hint="不同尺寸相对基准价的价格倍数"
          presets={SIZE_PRESETS}
          entries={editing.sizeEntries}
          onChange={(sizeEntries) => setEditing({ ...editing, sizeEntries })}
        />
        <FactorEditor
          title="质量系数"
          hint="不同质量档位相对基准价的价格倍数"
          presets={QUALITY_PRESETS}
          entries={editing.qualityEntries}
          onChange={(qualityEntries) => setEditing({ ...editing, qualityEntries })}
        />
        <div className="grid2">
          <label><span>备注</span><input value={editing.remark || ""} onChange={(event) => setEditing({ ...editing, remark: event.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} /><span>是否生效</span></label>
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer>
          <button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button>
          <button type="submit">保存并生效</button>
        </footer>
      </form>
    </div>}
  </section>;
}
